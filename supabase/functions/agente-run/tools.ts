// =============================================================================
// tools.ts — catálogo de ferramentas do agente (formato OpenAI function-calling)
// =============================================================================
// Duas tools, decididas na Onda 0 a partir do export n8n
// (docs/n8n-dissecado.md, pergunta 2): `think` (sem efeito colateral) e
// `notificacao` (transbordo, com pausa automática da IA). A tool `crm` do
// export fica de fora por decisão do usuário — está desconectada do agente no
// n8n (nenhuma aresta ai_tool liga `crm` ao `AI Agent`) e o corpo do
// sub-workflow `crm-novo-viviane` não veio no export.
//
// Conexão direta ao Postgres (`postgres@3.4.4`): `core` não é schema exposto
// no Data API, supabase-js com { db: { schema: 'core' } } dá PGRST106.

import type postgres from 'npm:postgres@3.4.4';
import type { ToolDefinition } from './llm.ts';

export interface ToolContext {
  sql: postgres.Sql;
  runId: string;
  pessoaId: string;
  telefoneE164: string | null;
}

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolExecutionResult>;

const TOOL_PARAMETERS: Record<string, Record<string, unknown>> = {
  think: {
    type: 'object',
    properties: {
      pensamento: {
        type: 'string',
        description:
          'O seu raciocínio antes de responder: qual a intenção do usuário, em qual etapa do funil ' +
          'estamos, o que já foi informado, quais perguntas já foram feitas, e qual a melhor abordagem ' +
          'para responder de forma natural e eficiente.',
      },
    },
    required: ['pensamento'],
    additionalProperties: false,
  },
  notificacao: {
    type: 'object',
    properties: {
      Resumo: {
        type: 'string',
        description: 'Resumo da conversa, seja para qualificação, seja para contexto geral.',
      },
      Nome: {
        type: 'string',
        description: 'Nome do lead, se informado.',
      },
      Administrativo_Comercial: {
        type: 'string',
        description: 'Se é uma notificação para o Administrativo ou para o Comercial.',
      },
    },
    required: ['Resumo', 'Administrativo_Comercial'],
    additionalProperties: false,
  },
};

// Descrições literais do system prompt/export n8n (docs/n8n-dissecado.md,
// pergunta 2) — inclusive o erro de digitação em `notificacao` ("clínciasobre"),
// preservado por fidelidade ao texto em produção.
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  think:
    'Use esta ferramenta para organizar seus pensamentos antes de cada resposta. Analise o contexto da ' +
    'conversa, identifique qual etapa do atendimento a cliente está, verifique quais informações já foram ' +
    'coletadas e determine a melhor abordagem para responder de forma natural e eficiente.',
  notificacao: 'Chame essa tool para notificar a clínciasobre variadas situações.',
};

/**
 * Monta a lista de tools a expor ao modelo nesta run, cruzando o catálogo
 * fixo acima com `core.agente_ia_tool` (description e enabled). Sem linha na
 * tabela, a tool ainda é oferecida com a descrição default — nunca some em
 * silêncio por falta de seed.
 */
export async function buildToolDefinitions(sql: postgres.Sql): Promise<ToolDefinition[]> {
  let rows: { name: string; description: string | null; enabled: boolean }[] = [];
  try {
    rows = await sql<{ name: string; description: string | null; enabled: boolean }[]>`
      select name, description, enabled from core.agente_ia_tool
    `;
  } catch (err) {
    console.warn('[agente-run] Falha ao carregar core.agente_ia_tool (usando defaults):', (err as Error).message);
  }

  const byName = new Map(rows.map((row) => [row.name, row]));

  return Object.keys(TOOL_PARAMETERS)
    .filter((name) => byName.get(name)?.enabled !== false)
    .map((name) => ({
      type: 'function' as const,
      function: {
        name,
        description: byName.get(name)?.description || DEFAULT_DESCRIPTIONS[name],
        parameters: TOOL_PARAMETERS[name],
      },
    }));
}

// --- think -------------------------------------------------------------------
// Tool nativa de raciocínio: sem efeito colateral. O valor está em o modelo
// escrever o pensamento antes de agir, não no conteúdo da resposta da tool.
function handleThink(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const pensamento = typeof args?.pensamento === 'string' ? args.pensamento : '';
  return Promise.resolve({ ok: true, data: { recebido: true, tamanho: pensamento.length } });
}

// --- notificacao ---------------------------------------------------------------
// Transbordo para humano. Duas diferenças deliberadas em relação ao n8n
// (docs/n8n-dissecado.md, pergunta 7 e "Pendências que dependem do João"):
//
//   1. PAUSA a IA nesta conversa (core.agente_ia_estado.ia_ativa = false) —
//      decisão do usuário. No n8n a IA continuava respondendo por cima do
//      atendente depois de escalar (o export não desligava nada).
//
//   2. O destino sai de core.agente_ia_config, escolhido pelo SETOR que o
//      modelo informa em Administrativo_Comercial. São dois GRUPOS de
//      WhatsApp (JID @g.us), confirmados pelo usuário — o corpo do
//      sub-workflow `notificacao_viviane` não veio no export, então essa
//      informação veio dele, não do n8n.
//
//      Um JID de grupo NÃO é telefone: nunca pode passar por
//      normalizePhoneE164, que o destruiria. Vai cru para a Uazapi.
//
//      Se o destino do setor não estiver configurado, a escalação ainda é
//      registrada e a IA ainda é pausada — só o alerta não sai, e isso é
//      logado com clareza, nunca falha em silêncio.
async function handleNotificacao(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolExecutionResult> {
  const resumo = typeof args?.Resumo === 'string' ? args.Resumo.trim() : '';
  const nome = typeof args?.Nome === 'string' && args.Nome.trim() ? args.Nome.trim() : null;
  const administrativoComercial =
    typeof args?.Administrativo_Comercial === 'string' ? args.Administrativo_Comercial.trim() : '';

  if (!resumo) return { ok: false, error: 'Resumo é obrigatório.' };
  if (!administrativoComercial) return { ok: false, error: 'Administrativo_Comercial é obrigatório.' };

  try {
    await ctx.sql`
      insert into core.agente_ia_estado (pessoa_id, ia_ativa)
      values (${ctx.pessoaId}, false)
      on conflict (pessoa_id) do update set ia_ativa = false, atualizado_em = now()
    `;

    await ctx.sql`
      insert into core.agente_ia_escalacao (pessoa_id, run_id, resumo)
      values (${ctx.pessoaId}, ${ctx.runId}, ${resumo})
    `;
  } catch (err) {
    return { ok: false, error: `Falha ao registrar escalação: ${(err as Error).message}` };
  }

  const setor = resolverSetor(administrativoComercial);

  const [config] = await ctx.sql<{ comercial: string | null; administrativo: string | null }[]>`
    select notificacao_destino_comercial      as comercial,
           notificacao_destino_administrativo as administrativo
      from core.agente_ia_config
     limit 1
  `;

  const destino = setor === 'administrativo' ? config?.administrativo : config?.comercial;

  if (!destino) {
    console.error(
      `[notificacao] Destino do setor '${setor}' não configurado em ` +
        'core.agente_ia_config (notificacao_destino_comercial / _administrativo). ' +
        'Escalação registrada e IA pausada, mas nenhum alerta de WhatsApp foi enviado.'
    );
    return {
      ok: true,
      data: {
        escalado: true,
        ia_pausada: true,
        notificado: false,
        setor,
        aviso: `Destino do setor '${setor}' não configurado.`,
      },
    };
  }

  const texto = montarTextoNotificacao({ resumo, nome, administrativoComercial, telefoneLead: ctx.telefoneE164 });
  const resultado = await enviarAlertaWhatsapp(ctx.sql, destino, texto);

  if (!resultado.ok) {
    console.error(`[notificacao] Falha ao alertar o setor '${setor}' em ${destino}: ${resultado.error}`);
  }

  return {
    ok: true,
    data: {
      escalado: true,
      ia_pausada: true,
      notificado: resultado.ok,
      setor,
      ...(resultado.ok ? {} : { erro: resultado.error }),
    },
  };
}

/**
 * O modelo escreve o setor em texto livre ("Comercial", "administrativo",
 * "Adm", "Comercial - lead novo"…). Só "administrativo" desvia; qualquer
 * outra coisa cai no Comercial, que é o caminho da esmagadora maioria dos
 * casos do prompt (leads novos). Um setor irreconhecível é logado, nunca
 * descartado em silêncio.
 */
function resolverSetor(valor: string): 'administrativo' | 'comercial' {
  const normalizado = valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalizado.includes('admin')) return 'administrativo';
  if (!normalizado.includes('comerc')) {
    console.warn(`[notificacao] Setor não reconhecido ('${valor}') — tratando como Comercial.`);
  }
  return 'comercial';
}

function montarTextoNotificacao(input: {
  resumo: string;
  nome: string | null;
  administrativoComercial: string;
  telefoneLead: string | null;
}): string {
  return [
    `🔔 Notificação — ${input.administrativoComercial}`,
    '',
    `👤 Lead: ${input.nome ?? 'não informado'}`,
    `📞 Telefone: ${input.telefoneLead ?? 'não identificado'}`,
    '',
    input.resumo,
  ].join('\n');
}

// Chama a Uazapi diretamente com o token da instância cadastrada em
// whatsapp_instancias — não passa pela function whatsapp-send porque o
// destino aqui é um número interno da equipe, não uma conversa/lead
// (whatsapp_conversas). Escopo enxuto: assume uma única instância (um número
// para a Viviane Braga) — se um dia houver mais de uma, esta função precisa
// de um critério de qual usar.
// `destino` vai CRU para a Uazapi: pode ser um JID de grupo (@g.us) ou um
// telefone. Não normalize aqui — normalizePhoneE164 destruiria o JID.
async function enviarAlertaWhatsapp(
  sql: postgres.Sql,
  destino: string,
  texto: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const [instancia] = await sql<{ base_url: string; token: string }[]>`
      select base_url, token from whatsapp_instancias where token is not null limit 1
    `;
    if (!instancia) {
      return { ok: false, error: 'Nenhuma instância do WhatsApp com token configurado em whatsapp_instancias.' };
    }

    const resp = await fetch(`${instancia.base_url}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instancia.token },
      body: JSON.stringify({ number: destino, text: texto }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      return { ok: false, error: `Uazapi respondeu ${resp.status}: ${detalhe}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Erro de rede ao chamar Uazapi: ${(err as Error).message}` };
  }
}

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  think: handleThink,
  notificacao: handleNotificacao,
};
