// =============================================================================
// whatsapp-webhook — recebe evento da Uazapi, valida, grava e decide se
// enfileira para o agente de IA.
// =============================================================================
// Escopo enxuto (Onda 1): só mensagem de texto/mídia simples. Reação, edição,
// exclusão e figurinha são "camada avançada" da skill whatsapp-uazapi — não
// pedidas para este projeto, não implementadas.
//
// Princípio (whatsapp-uazapi/reference/seguranca.md): a mensagem SEMPRE é
// gravada — só o disparo do agente é condicional. Isso mantém a tela de
// conversas fiel mesmo quando a IA está pausada ou a conversa está com a
// etiqueta de "não atender pela IA".
//
// Portões que impedem o AGENTE de responder, na ORDEM do n8n original
// (docs/n8n-dissecado.md, pergunta 7 — "Outros portões, na ordem em que
// aparecem"), depois de sempre persistir a mensagem:
//   1. Etiqueta wa_label contendo a etiqueta de bloqueio — pára tudo.
//   2. Mensagem == "#zerar" — corta a memória (core.agente_ia_estado.
//      ia_memoria_desde), não aciona o agente.
//   3. fromMe (mensagem do próprio operador, não da Uazapi) — único lugar
//      onde "#pausar"/"#voltar" têm efeito; nunca aciona o agente.
//   4. track_source == 'ia' (eco) ou 'crm' (mensagem do CRM) — não aciona.
//   5. core.agente_ia_estado.ia_ativa == false (pausado por "#pausar" ou pela
//      tool `notificacao`) — não aciona.
//
// Mudança deliberada em relação ao n8n: o comando de pausa era "Oi!"
// (case-sensitive) — uma saudação natural, o pior bug do export, pois
// silenciava a IA de qualquer lead que cumprimentasse "Oi!" para sempre, sem
// aviso. Aqui viraram "#pausar"/"#voltar" — string que ninguém digita por
// acidente. "#zerar" foi mantido (limpa memória).
//
// `core.*` não é exposto no Data API (PostgREST) — toda leitura/escrita usa
// conexão direta ao Postgres via SUPABASE_DB_URL (postgres@3.4.4), a mesma
// convenção do agente-run. As tabelas public.whatsapp_* também são acessadas
// por essa mesma conexão (é a mesma base, um cliente só é mais simples do
// que manter supabase-js + postgres.js ao mesmo tempo).

import postgres from 'npm:postgres@3.4.4';
import { normalizePhoneE164 } from '../_shared/phone.ts';

// Defaults só para o caso de core.agente_ia_config não ter linha ainda (nunca
// falha em silêncio por falta de seed) — o valor de verdade vem do banco, via
// core.agente_ia_config.{comando_pausar,comando_voltar,comando_zerar_memoria,
// etiqueta_bloqueio}, editável pela aba Configuração da tela de agentes.
const DEFAULT_COMANDO_PAUSAR = '#pausar';
const DEFAULT_COMANDO_VOLTAR = '#voltar';
const DEFAULT_COMANDO_ZERAR = '#zerar';
// Etiqueta do WhatsApp usada como "não atender pela IA" (docs/n8n-dissecado.md,
// pergunta 7, nó If3). O prefixo "5521968482967" é o número da instância
// Uazapi — não é o número de nenhum lead.
const DEFAULT_ETIQUETA_BLOQUEIO = '5521968482967:13';

interface AgenteConfigComandos {
  comando_pausar: string | null;
  comando_voltar: string | null;
  comando_zerar_memoria: string | null;
  etiqueta_bloqueio: string | null;
}

interface UazapiMessage {
  fromMe?: boolean;
  wasSentByApi?: boolean;
  track_source?: string;
  text?: string;
  body?: string;
  content?: unknown;
  messageType?: string;
  mediaType?: string;
  type?: string;
  id?: string;
  messageid?: string;
  messageId?: string;
}

interface UazapiChat {
  wa_chatid?: string;
  wa_label?: string;
  name?: string;
}

interface UazapiPayload {
  EventType?: string;
  chat?: UazapiChat;
  message?: UazapiMessage;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const instanciaNome = url.searchParams.get('instancia');
  const providedSecret = req.headers.get('x-webhook-secret') ?? url.searchParams.get('secret');

  if (!instanciaNome) {
    return textResponse("parâmetro 'instancia' ausente na URL do webhook", 400);
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    console.error('[whatsapp-webhook] SUPABASE_DB_URL ausente no ambiente.');
    return textResponse('SUPABASE_DB_URL não configurado.', 500);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1 });

  try {
    const [instancia] = await sql<{ id: string; webhook_secret: string | null }[]>`
      select id, webhook_secret from whatsapp_instancias where nome = ${instanciaNome}
    `;
    if (!instancia) {
      return textResponse('instância desconhecida', 404);
    }
    // Fail-closed nos dois casos: sem secret configurado nunca aceita tudo por
    // omissão; secret errado é 401.
    if (!instancia.webhook_secret || providedSecret !== instancia.webhook_secret) {
      return textResponse('não autorizado', 401);
    }

    const [configRow] = await sql<AgenteConfigComandos[]>`
      select comando_pausar, comando_voltar, comando_zerar_memoria, etiqueta_bloqueio
      from core.agente_ia_config
      where canal_codigo = 'whatsapp'
      limit 1
    `;
    const comandoPausar = (configRow?.comando_pausar || DEFAULT_COMANDO_PAUSAR).trim().toLowerCase();
    const comandoVoltar = (configRow?.comando_voltar || DEFAULT_COMANDO_VOLTAR).trim().toLowerCase();
    const comandoZerar = (configRow?.comando_zerar_memoria || DEFAULT_COMANDO_ZERAR).trim().toLowerCase();
    const etiquetaBloqueio = configRow?.etiqueta_bloqueio || DEFAULT_ETIQUETA_BLOQUEIO;

    let payload: UazapiPayload;
    try {
      payload = await req.json();
    } catch {
      return textResponse('JSON inválido', 400);
    }

    // "messages_update" (reação/edição/exclusão) é camada avançada, fora do
    // escopo desta Onda — nunca filtrar só por "messages" ingenuamente seria
    // o erro (faria eventos avançados sumirem em silêncio), mas aqui eles
    // realmente não têm o que fazer: só descartamos, sem gravar.
    const eventType = payload.EventType;
    if (eventType && eventType !== 'messages') {
      return textResponse('ok', 200);
    }

    const message = payload.message ?? {};
    const chat = payload.chat ?? {};

    if (message.wasSentByApi) {
      // Eco de verdade do próprio envio — já foi gravado por whatsapp-send.
      return textResponse('ok', 200);
    }

    const chatId = chat.wa_chatid;
    if (!chatId) {
      return textResponse('payload sem chat.wa_chatid', 400);
    }
    if (chatId.endsWith('@g.us')) {
      // Grupo de WhatsApp — fora do escopo (atendimento é 1:1 com o lead).
      return textResponse('ok', 200);
    }

    const telefoneE164 = normalizePhoneE164(chatId);
    if (!telefoneE164) {
      return textResponse('não foi possível normalizar o telefone', 400);
    }

    const saida = Boolean(message.fromMe);

    const conteudoBruto: unknown = message.text ?? message.body ?? message.content;
    const conteudo: string | null =
      typeof conteudoBruto === 'string'
        ? conteudoBruto || null
        : typeof (conteudoBruto as { text?: unknown } | null)?.text === 'string'
          ? (conteudoBruto as { text: string }).text || null
          : null;

    const tipoMidia = mapearTipoConteudo(message.mediaType ?? message.type ?? message.messageType);
    const idExterno = message.messageid ?? message.messageId ?? message.id ?? null;

    // Anúncio (CTWA): o WhatsApp só manda `contextInfo` na mensagem do clique,
    // então isto fica null em toda mensagem seguinte — é o comportamento do
    // n8n, que relia o payload do webhook a cada mensagem. Ver 0010.
    const contextInfo = (message.content as { contextInfo?: Record<string, unknown> } | null)?.contextInfo;
    const externalAdReply = contextInfo?.externalAdReply as { body?: unknown } | undefined;
    const fonte = typeof contextInfo?.conversionSource === 'string' ? contextInfo.conversionSource || null : null;
    const textoAnuncio = typeof externalAdReply?.body === 'string' ? externalAdReply.body || null : null;

    if (!conteudo && !tipoMidia) {
      return textResponse('ok', 200); // sem conteúdo reconhecível
    }

    // Resolve ou cria a conversa. ON CONFLICT evita corrida entre mensagens
    // simultâneas do mesmo contato chegando em paralelo.
    const [conversa] = await sql<{ id: string }[]>`
      insert into whatsapp_conversas (instancia_id, contato_telefone, contato_nome)
      values (${instancia.id}, ${telefoneE164}, ${chat.name ?? null})
      on conflict (instancia_id, contato_telefone)
      do update set contato_nome = coalesce(excluded.contato_nome, whatsapp_conversas.contato_nome)
      returning id
    `;

    // Idempotência: a Uazapi reentrega o mesmo evento quando não recebe 200 a
    // tempo. Mesmo messageid já gravado = reentrega, não mensagem nova.
    if (idExterno) {
      const [existente] = await sql<{ id: string }[]>`
        select id from whatsapp_mensagens where conversa_id = ${conversa.id} and id_externo = ${idExterno}
      `;
      if (existente) return textResponse('ok', 200);
    }

    await sql`
      insert into whatsapp_mensagens (conversa_id, direcao, remetente, tipo_conteudo, conteudo, id_externo, status_entrega, fonte, texto_anuncio)
      values (
        ${conversa.id}, ${saida ? 'saida' : 'entrada'}, ${saida ? 'agente' : 'contato'},
        ${tipoMidia ?? 'texto'}, ${conteudo}, ${idExterno}, ${saida ? 'enviado' : 'entregue'},
        ${fonte}, ${textoAnuncio}
      )
    `;

    // ---- A partir daqui: portões que decidem se o agente é acionado -------
    const mensagemNormalizada = (conteudo ?? '').trim().toLowerCase();

    // 1) Etiqueta de "não atender pela IA" — pára tudo, igual ao n8n (If3).
    // Etiqueta vazia/null (configurável em core.agente_ia_config) desativa o bloqueio.
    if (etiquetaBloqueio && chat.wa_label && chat.wa_label.includes(etiquetaBloqueio)) {
      return textResponse('ok', 200);
    }

    // 2) Comando de zerar memória — corta a memória (o agente ignora tudo
    // anterior a agora para esta conversa). Igual ao n8n, funciona venha a
    // mensagem de quem vier (não é restrito a fromMe).
    if (mensagemNormalizada === comandoZerar) {
      await sql`
        insert into core.agente_ia_estado (pessoa_id, ia_memoria_desde)
        values (${conversa.id}, now())
        on conflict (pessoa_id) do update set ia_memoria_desde = now(), atualizado_em = now()
      `;
      return textResponse('ok', 200);
    }

    // 3) Mensagem do próprio operador (fromMe, sem ser eco da nossa API) —
    // único lugar onde os comandos de pausar/voltar têm efeito. Nunca aciona
    // o agente.
    if (saida) {
      if (mensagemNormalizada === comandoPausar) {
        await sql`
          insert into core.agente_ia_estado (pessoa_id, ia_ativa)
          values (${conversa.id}, false)
          on conflict (pessoa_id) do update set ia_ativa = false, atualizado_em = now()
        `;
      } else if (mensagemNormalizada === comandoVoltar) {
        await sql`
          insert into core.agente_ia_estado (pessoa_id, ia_ativa)
          values (${conversa.id}, true)
          on conflict (pessoa_id) do update set ia_ativa = true, atualizado_em = now()
        `;
      }
      return textResponse('ok', 200);
    }

    // A partir daqui é mensagem genuína do lead (não fromMe, não eco).
    // 4) track_source vem direto no payload da Uazapi quando a mensagem foi
    // originada por um envio nosso marcado com essa tag (ver whatsapp-send).
    // 'ia' é rede de segurança extra contra eco (wasSentByApi já devia ter
    // pego); 'crm' é mensagem gerada por integração de CRM — já foi
    // persistida acima, só não aciona o agente (a tool `crm` do n8n não foi
    // migrada, mas o portão continua fazendo sentido para writes externos).
    if (message.track_source === 'ia' || message.track_source === 'crm') {
      return textResponse('ok', 200);
    }

    // 5) Pausa (por "#pausar" ou pela tool `notificacao`, que pausa a IA ao
    // escalar para humano — mudança deliberada em relação ao n8n).
    const [estado] = await sql<{ ia_ativa: boolean }[]>`
      select ia_ativa from core.agente_ia_estado where pessoa_id = ${conversa.id}
    `;
    if (estado && estado.ia_ativa === false) {
      return textResponse('ok', 200);
    }

    // Placeholder para mídia sem transcrição — transcrever áudio, analisar
    // imagem/PDF não fazem parte do escopo desta Onda (só as tools
    // think/notificacao). Sem isso a mensagem de mídia chegaria vazia ao LLM.
    const conteudoParaAgente = conteudo ?? (tipoMidia ? `[mídia recebida: ${tipoMidia}]` : '');

    // Portão de origem: só lead que veio de ANÚNCIO é atendido pela IA
    // (regra do João, 30/08 — ver migração 0015). Barra aqui, ANTES de
    // enfileirar, e não no flush: com `continue` no flush a mensagem ficaria
    // no buffer para sempre e voltaria a ser respondida no dia em que a regra
    // mudasse, fora de hora. Foi o que aconteceu com a trava de telefone.
    // A mensagem continua gravada em whatsapp_mensagens e visível na tela —
    // só não vira atendimento automático.
    const [regra] = await sql<{ somente_leads_anuncio: boolean }[]>`
      select somente_leads_anuncio from core.agente_ia_config where canal_codigo = 'whatsapp'
    `;
    if (regra?.somente_leads_anuncio) {
      // A regra de anúncio é ABSOLUTA para atendimento automático (0018).
      // `ia_forcada` NÃO fura aqui — ela só vence o interruptor geral. Furar
      // a regra de anúncio só pelo botão "Disparar IA", que é explícito e de
      // um turno. Na 0016 eu tinha deixado `ia_forcada` furar também, e uma
      // cliente antiga (sem origem de anúncio) acabou atendida pelo agente
      // comercial.
      const [origem] = await sql<{ veio: boolean }[]>`
        select core.fn_conversa_veio_de_anuncio(${conversa.id}) as veio
      `;
      if (!origem?.veio) {
        console.log(`[whatsapp-webhook] conversa ${conversa.id} não veio de anúncio — não enfileirada.`);
        return textResponse('ok', 200);
      }
    }

    await sql`select core.agente_ia_enqueue_message(${conversa.id}, ${telefoneE164}, ${conteudoParaAgente}, ${idExterno})`;

    return textResponse('ok', 200);
  } catch (err) {
    console.error('[whatsapp-webhook] erro inesperado:', err);
    return textResponse('erro interno', 500);
  } finally {
    try {
      await sql.end({ timeout: 5 });
    } catch (_e) {
      // Falha ao fechar a conexão não deve virar erro visível.
    }
  }
});

function mapearTipoConteudo(raw: string | undefined | null): string | null {
  const tipo = (raw ?? '').toLowerCase();
  if (tipo.includes('image')) return 'imagem';
  if (tipo.includes('video')) return 'video';
  if (tipo.includes('audio') || tipo.includes('ptt')) return 'audio';
  if (tipo.includes('document')) return 'documento';
  return null;
}

function textResponse(text: string, status: number): Response {
  return new Response(text, { status });
}
