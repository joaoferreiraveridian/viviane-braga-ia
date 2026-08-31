import postgres from 'npm:postgres@3.4.4';
import { callOpenRouter, ChatMessage, OpenRouterError, ToolCall } from './llm.ts';
import { buildToolDefinitions, TOOL_HANDLERS, ToolContext } from './tools.ts';
import { splitAgentMessage, dedupeRepeatedParts, capMessageParts, MAX_MESSAGE_PARTS } from './split-message.ts';

// =============================================================================
// agente-run — o cérebro do agente de IA de WhatsApp da Viviane Braga Advocacia.
// =============================================================================
// Substitui o nó "AI Agent" do n8n (export agente-base-viviane_braga.json).
// CONTRATO: POST { run_id: uuid }, onde run_id aponta para core.agente_ia_run
// (criada por core.agente_ia_flush_due_buffers). Idempotente: se a run já está
// 'running' ou 'succeeded', não reprocessa — chamada duplicada do pg_net não
// responde duas vezes.
//
// `core` NÃO é schema exposto no Data API (PostgREST): toda leitura/escrita
// usa conexão direta ao Postgres via `postgres@3.4.4` (SUPABASE_DB_URL).
// supabase-js com { db: { schema: 'core' } } dá PGRST106 — não tente.
//
// BOTÃO DE SEGURANÇA: enquanto core.agente_ia_config não tiver uma linha
// enabled=true para o canal 'whatsapp', o agente nunca responde de verdade,
// mesmo que o buffer enfileire mensagens e crie runs. A run vira 'skipped'
// com o motivo — nunca falha em silêncio, nunca envia nada.
//
// LLM: deepseek/deepseek-v4-flash-0731 via OpenRouter — fixo, não trocar (ver
// docs/n8n-dissecado.md, pergunta 6). SEM TEMPERATURA: o n8n nunca definia
// `options.temperature` no nó "OpenRouter Chat Model" — o provedor usa o
// default dele. Por isso esta function NUNCA envia `temperature` à
// OpenRouter, mesmo que core.agente_ia_config.temperature tenha algum valor
// (a coluna existe no schema genérico do template para outros agentes, mas
// não é lida aqui — fidelidade ao comportamento real de produção, não uma
// omissão).
//
// Memória: últimas 15 mensagens de public.whatsapp_mensagens desta conversa
// (docs/n8n-dissecado.md, pergunta 4 — mesma janela do `Postgres Chat Memory`
// do n8n, contextWindowLength: 15).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: { run_id?: string; manual?: boolean };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido.' }, 400);
  }

  const runId = body.run_id;
  if (!runId) {
    return jsonResponse({ error: 'run_id é obrigatório.' }, 400);
  }

  // Disparo manual (api.fn_agente_disparar, migração 0014): um operador logado
  // clicou "Disparar IA" numa conversa. Ignora o botão de segurança `enabled`
  // — que existe para conter o AUTOMÁTICO, não a ação humana deliberada. É o
  // que permite testar um lead específico com o agente desligado para todos.
  const manual = body.manual === true;

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    console.error('[agente-run] SUPABASE_DB_URL ausente no ambiente.');
    return jsonResponse({ error: 'SUPABASE_DB_URL não configurado.' }, 500);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    const result = await processRun(sql, runId, manual);
    return jsonResponse(result, 200);
  } catch (err) {
    // Última rede de segurança: qualquer exceção não tratada dentro de
    // processRun() já deveria ter marcado a run como 'failed' (ver catch
    // interno). Isso aqui só cobre falhas ANTES de nem conseguirmos carregar
    // a run (ex.: erro ao instanciar a conexão).
    console.error(`[agente-run] Erro fatal não tratado (run_id=${runId}):`, err);
    return jsonResponse({ error: (err as Error).message }, 500);
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (_e) {
      // Falha ao fechar a conexão não deve virar erro visível.
    }
  }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_TOOL_ITERATIONS = 8;
// Memória: default de 15 mensagens (docs/n8n-dissecado.md, pergunta 4 —
// contextWindowLength do Postgres Chat Memory do n8n). O valor de verdade vem
// de core.agente_ia_config.memoria_janela_mensagens (editável pela aba
// Configuração da tela de agentes) — este é só o fallback se a coluna vier
// nula/ausente, nunca falha em silêncio por falta de seed.
const DEFAULT_HISTORY_WINDOW = 15;

type RunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface RunRow {
  id: string;
  pessoa_id: string;
  telefone_e164: string | null;
  input_text: string;
  status: RunStatus;
  created_at: string;
  trigger_message_ids: string[] | null;
}

interface ConfigRow {
  provider: string | null;
  model: string | null;
  system_prompt: string | null;
  enabled: boolean;
  memoria_janela_mensagens: number | null;
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// =============================================================================
// Orquestração de uma run
// =============================================================================
async function processRun(sql: postgres.Sql, runId: string, manual = false): Promise<Record<string, unknown>> {
  let stepIndex = 0;
  const logStep = (step_type: string, fields: Record<string, unknown> = {}) =>
    logRunStep(sql, runId, stepIndex++, step_type, fields);

  // --- 1) Carrega a run e garante idempotência (chamada duplicada do mesmo run_id) ---
  const [run] = await sql<RunRow[]>`
    select id, pessoa_id, telefone_e164, input_text, status, created_at, trigger_message_ids
    from core.agente_ia_run
    where id = ${runId}
  `;

  if (!run) {
    throw new Error(`core.agente_ia_run não encontrada para run_id=${runId}.`);
  }

  // A reserva da run precisa ser ATÔMICA. Um select seguido de update é
  // check-then-act: se o pg_net estourar timeout e reenviar, as duas
  // invocações leem 'pending' antes de qualquer uma escrever 'running', e as
  // duas chamam o LLM e enviam a mensagem — o lead recebe a resposta em
  // dobro. É a armadilha que já duplicou envio em produção. O update
  // condicional abaixo deixa exatamente uma invocação passar: quem não
  // reservar recebe 0 linhas e sai sem processar.
  const reservadas = await sql<{ id: string }[]>`
    update core.agente_ia_run
       set status = 'running', started_at = now()
     where id = ${runId}
       and status in ('pending', 'failed')
    returning id
  `;

  if (reservadas.length === 0) {
    console.log(`[agente-run] run_id=${runId} já reservada por outra invocação (status='${run.status}') — ignorando chamada duplicada.`);
    return { skipped: true, reason: `run já está '${run.status}'` };
  }

  const runStart = Date.now();

  try {
    // --- 2) Carrega a config do canal 'whatsapp' (botão de segurança) ---
    // Este projeto não tem tabela separada de canal (core.canal_whatsapp):
    // core.agente_ia_config guarda o canal como texto (canal_codigo), não
    // como FK — schema enxuto do template agente-n8n-supabase/template/sql
    // /01-agente.sql. Uma única consulta decide os dois casos: linha
    // ausente (configuração nunca rodou) é erro; linha com enabled=false é
    // o botão de segurança acionado (run 'skipped', motivo gravado, nunca
    // falha em silêncio).
    const [config] = await sql<ConfigRow[]>`
      select provider, model, system_prompt, enabled, memoria_janela_mensagens
      from core.agente_ia_config
      where canal_codigo = 'whatsapp'
      limit 1
    `;

    if (!config) {
      throw new Error(
        "core.agente_ia_config não tem nenhuma linha com canal_codigo='whatsapp' — falta rodar a " +
          'migration/seed antes de usar o agente.'
      );
    }

    if (!config.enabled && !manual) {
      const reason = "core.agente_ia_config.enabled está false para o canal 'whatsapp' — botão de segurança desligado.";
      await logStep('error', { output: { skipped: true, reason } });
      await sql`
        update core.agente_ia_run
        set status = 'skipped', error = ${`Run pulada: ${reason}`}, finished_at = now(),
            latency_ms = ${Date.now() - runStart}
        where id = ${runId}
      `;
      return { skipped: true, reason };
    }

    if (!config.system_prompt || config.system_prompt.trim().length === 0) {
      const reason = "core.agente_ia_config.system_prompt está vazio para a linha enabled=true do canal 'whatsapp'.";
      await logStep('error', { output: { skipped: true, reason } });
      await sql`
        update core.agente_ia_run
        set status = 'skipped', error = ${`Run pulada: ${reason}`}, finished_at = now(),
            latency_ms = ${Date.now() - runStart}
        where id = ${runId}
      `;
      return { skipped: true, reason };
    }

    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
    if (!OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY não configurada nos Secrets da Edge Function.');
    }

    // Fallback aponta para o próprio modelo fixado (nunca para outro
    // provedor/modelo) — belt-and-suspenders caso o seed de
    // core.agente_ia_config.model venha vazio.
    const model = config.model || 'deepseek/deepseek-v4-flash-0731';

    // --- 3) Monta as mensagens: system pronto (sem template), histórico, turno atual ---
    const systemPrompt = config.system_prompt;

    const historyWindow = config.memoria_janela_mensagens && config.memoria_janela_mensagens > 0
      ? config.memoria_janela_mensagens
      : DEFAULT_HISTORY_WINDOW;

    const history = await loadConversationHistory(sql, run.pessoa_id, run.created_at, run.trigger_message_ids, run.input_text, historyWindow);

    const anuncio = await loadDadosAnuncio(sql, run.pessoa_id, run.trigger_message_ids);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: montarTurnoDoUsuario(run.input_text, anuncio) },
    ];

    const tools = await buildToolDefinitions(sql);

    const toolCtx: ToolContext = {
      sql,
      runId,
      pessoaId: run.pessoa_id,
      telefoneE164: run.telefone_e164,
    };

    // --- 4) Loop de tool calling ---
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let costUsd = 0;
    let costUsdKnown = false;
    let finishReason: string | null = null;
    let outputText: string | null = null;

    let iteration = 0;
    for (; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const llmInputSnapshot = messages.map((m) => ({ role: m.role, content: m.content, tool_calls: m.tool_calls }));

      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        // Nunca envia temperatura — ver nota no topo do arquivo.
        temperature: null,
        messages,
        tools,
      });

      if (result.usage) {
        promptTokens += result.usage.prompt_tokens ?? 0;
        completionTokens += result.usage.completion_tokens ?? 0;
        totalTokens += result.usage.total_tokens ?? 0;
        if (typeof result.usage.cost === 'number') {
          costUsd += result.usage.cost;
          costUsdKnown = true;
        }
      }

      await logStep('llm_call', {
        input: { messages: llmInputSnapshot, model },
        output: { message: result.message, finish_reason: result.finish_reason, usage: result.usage },
        tokens: result.usage?.total_tokens ?? null,
        latency_ms: result.latency_ms,
      });

      finishReason = result.finish_reason;
      messages.push(result.message);

      const toolCalls = result.message.tool_calls as ToolCall[] | undefined;
      if (!toolCalls || toolCalls.length === 0) {
        outputText = result.message.content ?? '';
        break;
      }

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = toolCall.function.arguments ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>) : {};
        } catch {
          args = { _raw: toolCall.function.arguments };
        }

        const handler = TOOL_HANDLERS[toolName];
        if (!handler) {
          await logStep('error', { tool_name: toolName, input: args, error: `Tool desconhecida: ${toolName}` });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: false, error: `Tool desconhecida: ${toolName}` }),
          });
          continue;
        }

        let execResult;
        try {
          execResult = await handler(args, toolCtx);
        } catch (err) {
          execResult = { ok: false, error: `Erro inesperado na tool ${toolName}: ${(err as Error).message}` };
        }

        if (toolName === 'think') {
          // core.agente_ia_run_step já prevê um step_type 'thinking' dedicado
          // (distinto de tool_call/tool_result) — think não tem efeito
          // colateral, então um único step junto de chamada+resultado é
          // suficiente e deixa a aba Execuções renderizar o raciocínio à parte.
          await logStep('thinking', {
            tool_name: toolName,
            input: args,
            output: execResult.data ?? null,
            error: execResult.ok ? null : execResult.error,
          });
        } else {
          await logStep('tool_call', { tool_name: toolName, input: args });
          await logStep('tool_result', {
            tool_name: toolName,
            output: execResult.data ?? null,
            error: execResult.ok ? null : execResult.error,
          });
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(execResult.ok ? { ok: true, ...toValue(execResult.data) } : { ok: false, error: execResult.error }),
        });
      }
      // volta pro topo do loop: manda o(s) resultado(s) de tool de volta pro modelo
    }

    if (outputText === null) {
      // Excedeu MAX_TOOL_ITERATIONS sem resposta final em texto — falha alto e
      // claro em vez de mandar algo incompleto ao lead no WhatsApp.
      throw new Error(`Excedido limite de ${MAX_TOOL_ITERATIONS} iterações de tool calling sem resposta final do modelo.`);
    }

    // --- 5) Quebra a resposta em várias mensagens e envia em sequência ---
    const rawParts = dedupeRepeatedParts(splitAgentMessage(outputText));
    const { parts: messageParts, capped, originalPartCount } = capMessageParts(rawParts);
    const partsToSend = messageParts.length > 0 ? messageParts : [outputText];

    if (capped) {
      console.warn(
        `[agente-run] run_id=${runId}: split gerou ${originalPartCount} partes, acima do teto de ` +
          `${MAX_MESSAGE_PARTS} (risco de estourar o timeout da Edge Function). As partes excedentes foram ` +
          'agrupadas na última mensagem enviada.'
      );
    }

    const sentParts: Array<{ part_index: number; id_mensagem: string | null }> = [];
    let sendFailure: { part_index: number; error: string } | null = null;

    for (let partIndex = 0; partIndex < partsToSend.length; partIndex++) {
      const part = partsToSend[partIndex];
      const sendResult = await sendWhatsappMessage(run.pessoa_id, part);

      const isLastPart = partIndex === partsToSend.length - 1;
      await logStep('send_message', {
        input: {
          pessoa_id: run.pessoa_id,
          tipo: 'texto',
          mensagem: part,
          part_index: partIndex,
          total_parts: partsToSend.length,
        },
        output: {
          ...sendResult,
          part_index: partIndex,
          total_parts: partsToSend.length,
          ...(capped && isLastPart
            ? { capped: true, original_part_count: originalPartCount, max_message_parts: MAX_MESSAGE_PARTS }
            : {}),
        },
        error: sendResult.ok ? null : sendResult.error,
      });

      if (!sendResult.ok) {
        // Falha no meio do envio: registra o erro e NÃO manda as partes
        // seguintes (evitaria mensagem pela metade / fora de ordem).
        sendFailure = { part_index: partIndex, error: sendResult.error ?? 'erro desconhecido ao enviar' };
        break;
      }

      sentParts.push({ part_index: partIndex, id_mensagem: sendResult.id_mensagem ?? null });

      if (!isLastPart) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (sendFailure) {
      throw new Error(
        `Falha ao enviar parte ${sendFailure.part_index + 1}/${partsToSend.length} via whatsapp-send: ` +
          `${sendFailure.error}. ${sentParts.length} parte(s) já haviam sido enviadas com sucesso antes da falha.`
      );
    }

    // --- 6) Finaliza core.agente_ia_run ---
    await sql`
      update core.agente_ia_run
      set status = 'succeeded',
          output_text = ${outputText},
          finish_reason = ${finishReason},
          prompt_tokens = ${promptTokens},
          completion_tokens = ${completionTokens},
          total_tokens = ${totalTokens},
          cost_usd = ${costUsdKnown ? costUsd : null},
          latency_ms = ${Date.now() - runStart},
          system_prompt_snapshot = ${systemPrompt},
          model = ${model},
          provider = 'openrouter',
          finished_at = now()
      where id = ${runId}
    `;

    return { ok: true, output_text: outputText, iterations: iteration + 1 };
  } catch (err) {
    const message = err instanceof OpenRouterError ? err.message : (err as Error).message;
    console.error(`[agente-run] run_id=${runId} falhou:`, err);

    await logStep('error', { error: message });
    await sql`
      update core.agente_ia_run
      set status = 'failed', error = ${message}, finished_at = now(), latency_ms = ${Date.now() - runStart}
      where id = ${runId}
    `;

    // Rede de segurança: antes disto, uma run 'failed' deixava o lead sem
    // NENHUMA resposta e sem nenhum sinal visível de que algo deu errado.
    // Best-effort: se este envio também falhar, só loga — a run já está
    // marcada 'failed' de qualquer forma, e a pessoa segue visível na fila
    // para um humano assumir manualmente.
    try {
      const fallback = await sendWhatsappMessage(
        run.pessoa_id,
        'Recebi sua mensagem, mas tive um problema técnico agora para responder. Já sinalizei aqui — nossa equipe vai te responder em breve.'
      );
      if (!fallback.ok) {
        console.error(`[agente-run] run_id=${runId} falha também ao enviar mensagem de fallback:`, fallback.error);
      }
    } catch (fallbackErr) {
      console.error(`[agente-run] run_id=${runId} exceção ao enviar mensagem de fallback:`, fallbackErr);
    }

    return { ok: false, error: message };
  }
}

function toValue(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) return { data };
  return { data: data ?? null };
}

async function logRunStep(
  sql: postgres.Sql,
  runId: string,
  stepIndex: number,
  step_type: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    // `sql.json()` exige o tipo recursivo postgres.JSONValue -- fields.input/
    // output chegam como `unknown` (vêm de payloads externos: resposta da
    // OpenRouter, args de tool call). O cast via `unknown` é a forma correta
    // de dizer "isto é serializável em JSON", sem usar `any`.
    const inputJson = (fields.input ?? null) as unknown as postgres.JSONValue;
    const outputJson = (fields.output ?? null) as unknown as postgres.JSONValue;

    await sql`
      insert into core.agente_ia_run_step (run_id, step_index, step_type, tool_name, input, output, tokens, latency_ms, error)
      values (
        ${runId}, ${stepIndex}, ${step_type}, ${(fields.tool_name as string) ?? null},
        ${sql.json(inputJson)}, ${sql.json(outputJson)},
        ${(fields.tokens as number) ?? null}, ${(fields.latency_ms as number) ?? null}, ${(fields.error as string) ?? null}
      )
    `;
  } catch (error) {
    console.error(`[agente-run] Falha ao gravar core.agente_ia_run_step (run_id=${runId}, step=${step_type}):`, error);
  }
}

// =============================================================================
// Histórico de conversa — `public.whatsapp_mensagens`, filtrado por
// conversa_id = pessoa_id (schema da skill whatsapp-uazapi: "pessoa" neste
// agente É a linha de whatsapp_conversas, não existe tabela de pessoa/lead
// separada — ver reference/schema.md dessa skill, seção "Adaptando para um
// projeto que já tem schema de pessoa/CRM"). Janela de historyWindow
// mensagens: a mensagem que DISPAROU esta run é excluída por `id_externo`
// presente em `run.trigger_message_ids` — nunca por um filtro de tempo,
// porque a run é criada DEPOIS da mensagem (debounce), então um filtro
// `< run.created_at` sozinho NUNCA excluiria a mensagem-gatilho.
//
// Salvaguarda adicional (não o mecanismo principal): `ocorrido_em <
// run.created_at`, só para não puxar mensagens gravadas DEPOIS que esta run
// começou a processar.
//
// Fallback (trigger_message_ids vazio/só NULL): descarta, do fim do
// histórico para trás, as mensagens contíguas de direcao='entrada' cujo
// conteúdo já esteja contido em `run.input_text`.
//
// Corte de memória: se core.agente_ia_estado.ia_memoria_desde estiver
// preenchido (comando "#zerar"), ignora tudo anterior a essa data.
// =============================================================================
// =============================================================================
// Turno do usuário — o formato do nó "AI Agent" do n8n (promptType "define"):
//
//     Mensagem Lead: {{ ... }}
//     (linha em branco)
//     Dia atual: {{ $now }}
//     Hora atual: {{ $now.toFormat('HH:mm') }}
//     Fonte (se houver): {{ Fonte }}
//     Texto do Anúncio (se houver): {{ Texto do Anúncio }}
//
// Não é enfeite: a linha 232 do system prompt gravado manda qualificar o lead
// pelo texto do anúncio quando "Fonte" e "Texto do Anúncio" existem. Mandar só
// o input_text (como esta função fazia) deixava essa instrução sem efeito.
//
// A linha "Origem:" do export não é replicada — termina vazia lá, campo
// abandonado (docs/n8n-dissecado.md, linha 40).
//
// Timezone: o export não fixa `timezone` em settings, então o n8n usava o
// default da instância. America/Sao_Paulo confirmado pelo teste de 30/08 — a
// run nasceu 01:17Z e o WhatsApp do João mostrou 22:17.
// =============================================================================
const TIMEZONE_AGENTE = 'America/Sao_Paulo';

interface DadosAnuncio {
  fonte: string | null;
  texto_anuncio: string | null;
}

function montarTurnoDoUsuario(inputText: string, anuncio: DadosAnuncio | null): string {
  const agora = new Date();
  const dia = agora.toLocaleDateString('pt-BR', { timeZone: TIMEZONE_AGENTE });
  const hora = agora.toLocaleTimeString('pt-BR', {
    timeZone: TIMEZONE_AGENTE,
    hour: '2-digit',
    minute: '2-digit',
  });

  return [
    `Mensagem Lead: ${inputText}`,
    '',
    `Dia atual: ${dia}`,
    `Hora atual: ${hora}`,
    `Fonte (se houver): ${anuncio?.fonte ?? ''}`,
    `Texto do Anúncio (se houver): ${anuncio?.texto_anuncio ?? ''}`,
  ].join('\n');
}

// Lê os dados de anúncio das mensagens que dispararam ESTA run. O WhatsApp só
// manda `contextInfo.externalAdReply` na mensagem do clique no anúncio, então
// isto volta null em toda conversa que não começou por anúncio — e também nas
// mensagens seguintes do mesmo lead, que é a fidelidade ao n8n pedida (ver
// migração 0010).
//
// Falha aqui nunca derruba a run: sem os campos o agente responde como um
// lead orgânico, que é o comportamento correto de fallback.
async function loadDadosAnuncio(
  sql: postgres.Sql,
  pessoaId: string,
  triggerMessageIds: string[] | null
): Promise<DadosAnuncio | null> {
  const ids = (triggerMessageIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return null;

  try {
    const [row] = await sql<DadosAnuncio[]>`
      select fonte, texto_anuncio
        from whatsapp_mensagens
       where conversa_id = ${pessoaId}
         and id_externo = any(${ids})
         and (fonte is not null or texto_anuncio is not null)
       order by ocorrido_em
       limit 1
    `;
    return row ?? null;
  } catch (error) {
    console.warn(`[agente-run] Falha ao ler dados de anúncio (pessoa_id=${pessoaId}):`, (error as Error).message);
    return null;
  }
}

interface MensagemRow {
  direcao: string;
  remetente: string;
  conteudo: string | null;
  tipo_conteudo: string | null;
  ocorrido_em: string;
  id_externo: string | null;
}

async function loadConversationHistory(
  sql: postgres.Sql,
  pessoaId: string,
  runCreatedAt: string,
  triggerMessageIds: string[] | null,
  runInputText: string,
  historyWindow: number
): Promise<ChatMessage[]> {
  // Folga acima de historyWindow: depois de descontar a(s) mensagem(ns)
  // gatilho, ainda queremos preencher a janela inteira com histórico real.
  const FETCH_LIMIT = historyWindow + 25;

  const [estado] = await sql<{ ia_memoria_desde: string | null }[]>`
    select ia_memoria_desde from core.agente_ia_estado where pessoa_id = ${pessoaId}
  `;
  const memoriaDesde = estado?.ia_memoria_desde ?? null;

  let rowsDesc: MensagemRow[];
  try {
    rowsDesc = await sql<MensagemRow[]>`
      select direcao, remetente, conteudo, tipo_conteudo, ocorrido_em, id_externo
      from whatsapp_mensagens
      where conversa_id = ${pessoaId}
        and ocorrido_em < ${runCreatedAt}
        ${memoriaDesde ? sql`and ocorrido_em >= ${memoriaDesde}` : sql``}
      order by ocorrido_em desc
      limit ${FETCH_LIMIT}
    `;
  } catch (error) {
    console.warn(`[agente-run] Falha ao carregar histórico (pessoa_id=${pessoaId}):`, (error as Error).message);
    return [];
  }

  // --- 1) Exclui a(s) mensagem(ns) que DISPARARAM esta run, por id_externo ---
  const triggerIdSet = new Set((triggerMessageIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0));

  let withoutTrigger: MensagemRow[];
  if (triggerIdSet.size > 0) {
    withoutTrigger = rowsDesc.filter((row) => !row.id_externo || !triggerIdSet.has(row.id_externo));
  } else {
    // Fallback: trigger_message_ids veio vazio/só NULL. rowsDesc está do mais
    // recente pro mais antigo, então "descartar do fim do histórico" =
    // descartar a partir do ÍNDICE 0 aqui.
    withoutTrigger = [...rowsDesc];
    while (withoutTrigger.length > 0) {
      const candidate = withoutTrigger[0];
      const conteudo = (candidate.conteudo ?? '').trim();
      const isLeadMatch = candidate.direcao === 'entrada' && conteudo.length > 0 && runInputText.includes(conteudo);
      if (!isLeadMatch) break;
      withoutTrigger.shift();
    }
  }

  // --- 2) Aplica a janela de historyWindow, sobre histórico já limpo ---
  const windowed = withoutTrigger.slice(0, historyWindow);

  return windowed.reverse().map((row): ChatMessage => {
    const conteudo =
      row.tipo_conteudo === 'texto' || !row.tipo_conteudo ? row.conteudo ?? '' : `[mídia: ${row.tipo_conteudo}] ${row.conteudo ?? ''}`.trim();

    if (row.direcao === 'entrada') {
      return { role: 'user', content: conteudo };
    }
    if (row.remetente === 'agente') {
      // Mensagem enviada manualmente por um humano (não pelo bot) — marcada
      // no próprio conteúdo, para o modelo saber que não foi ele quem disse isso.
      return { role: 'assistant', content: `[Atendimento humano] ${conteudo}` };
    }
    // 'bot' -> resposta anterior do próprio agente.
    return { role: 'assistant', content: conteudo };
  });
}

// =============================================================================
// Envio de UMA parte da resposta — chama a Edge Function whatsapp-send escrita
// junto com este agente (supabase/functions/whatsapp-send/index.ts).
// `pessoa_id` aqui é o id de `whatsapp_conversas` (ver nota acima sobre não
// haver tabela de pessoa/lead separada neste projeto). `remetente: 'bot'`
// distingue da mensagem manual de um humano na hora de montar o histórico
// (loadConversationHistory). `track_source: 'ia'` é repassado à Uazapi para
// o whatsapp-webhook filtrar o eco desta mesma mensagem quando ela retornar
// pelo webhook (docs/n8n-dissecado.md, pergunta 7 — anti-eco).
// =============================================================================
async function sendWhatsappMessage(pessoaId: string, mensagem: string): Promise<{ ok: boolean; id_mensagem?: string | null; error?: string }> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { ok: false, error: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.' };
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({
        pessoa_id: pessoaId,
        mensagem,
        remetente: 'bot',
        track_source: 'ia',
        id_externo: crypto.randomUUID(),
      }),
    });

    const rawText = await resp.text();
    let json: { id_mensagem?: string; error?: string };
    try {
      json = rawText ? (JSON.parse(rawText) as { id_mensagem?: string; error?: string }) : {};
    } catch {
      json = {};
    }

    if (!resp.ok) {
      return { ok: false, error: `whatsapp-send respondeu ${resp.status}: ${rawText}` };
    }

    return { ok: true, id_mensagem: json.id_mensagem ?? null };
  } catch (err) {
    return { ok: false, error: `Erro de rede ao chamar whatsapp-send: ${(err as Error).message}` };
  }
}
