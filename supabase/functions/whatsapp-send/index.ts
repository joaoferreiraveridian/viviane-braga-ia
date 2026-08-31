// =============================================================================
// whatsapp-send — envia texto via Uazapi e persiste em public.whatsapp_mensagens.
// =============================================================================
// Escopo enxuto (Onda 1, agente Viviane Braga): só mensagem de TEXTO. Sem
// mídia, sem responder/reagir/editar/figurinha — isso é a "camada avançada" da
// skill whatsapp-uazapi e não foi pedido para este projeto.
//
// Duas origens chamam esta function: o agente de IA (agente-run, remetente
// 'bot') e, futuramente, um humano respondendo pela tela de conversas
// (remetente 'agente' — default).
//
// Idempotência via id_externo: se o chamador reenviar com o mesmo id_externo
// (retry de rede), não duplica a mensagem em whatsapp_mensagens — mas o
// reenvio para a Uazapi acontece de novo (não há como saber se a Uazapi já
// recebeu o pedido original sem consultar por messageid, o que ela não
// expõe por id_externo). Aceitável neste escopo: reenvio de rede é raro e o
// pior caso é enviar a mesma mensagem duas vezes ao lead, nunca duplicar o
// registro no banco.

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

type Remetente = 'agente' | 'bot';

interface EnviarPayload {
  pessoa_id?: string; // id de whatsapp_conversas — "pessoa" no vocabulário do agente
  mensagem?: string;
  id_externo?: string; // opcional; gerado aqui se ausente
  remetente?: Remetente;
  track_source?: string; // repassado à Uazapi p/ o webhook filtrar eco (ver whatsapp-webhook)
}

interface InstanciaRow {
  base_url: string;
  token: string;
}

interface ConversaRow {
  id: string;
  contato_telefone: string;
  whatsapp_instancias: InstanciaRow | InstanciaRow[] | null;
}

Deno.serve(async (req: Request) => {
  let body: EnviarPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'JSON inválido.' }, 400);
  }

  const pessoaId = body.pessoa_id;
  const mensagem = body.mensagem;
  if (!pessoaId || !mensagem) {
    return jsonResponse({ error: 'pessoa_id e mensagem são obrigatórios.' }, 400);
  }

  const idExterno = body.id_externo ?? crypto.randomUUID();
  const remetente: Remetente = body.remetente === 'bot' ? 'bot' : 'agente';

  const { data, error: conversaError } = await supabase
    .from('whatsapp_conversas')
    .select('id, contato_telefone, whatsapp_instancias(base_url, token)')
    .eq('id', pessoaId)
    .maybeSingle();

  if (conversaError || !data) {
    return jsonResponse({ error: 'conversa (pessoa_id) não encontrada.' }, 404);
  }
  const conversa = data as unknown as ConversaRow;

  const instanciaRaw = conversa.whatsapp_instancias;
  const instancia = Array.isArray(instanciaRaw) ? instanciaRaw[0] : instanciaRaw;
  if (!instancia?.base_url || !instancia?.token) {
    return jsonResponse({ error: 'instância do WhatsApp sem base_url/token configurados.' }, 500);
  }

  let uazapiResponse: Response;
  try {
    uazapiResponse = await fetch(`${instancia.base_url}/send/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: instancia.token },
      body: JSON.stringify({
        number: conversa.contato_telefone,
        text: mensagem,
        ...(body.track_source ? { track_source: body.track_source } : {}),
      }),
    });
  } catch (err) {
    return jsonResponse({ error: `Erro de rede ao chamar Uazapi: ${(err as Error).message}` }, 502);
  }

  if (!uazapiResponse.ok) {
    const detalhe = await uazapiResponse.text();
    console.error('[whatsapp-send] Uazapi recusou o envio', uazapiResponse.status, detalhe);
    return jsonResponse({ error: `Uazapi respondeu ${uazapiResponse.status}: ${detalhe}` }, 502);
  }

  const { data: mensagemRow, error: mensagemError } = await supabase
    .from('whatsapp_mensagens')
    .upsert(
      {
        conversa_id: pessoaId,
        direcao: 'saida',
        remetente,
        tipo_conteudo: 'texto',
        conteudo: mensagem,
        id_externo: idExterno,
        status_entrega: 'enviado',
      },
      { onConflict: 'conversa_id,id_externo' }
    )
    .select('id')
    .single();

  if (mensagemError || !mensagemRow) {
    console.error('[whatsapp-send] enviado à Uazapi mas falhou ao persistir', mensagemError);
    return jsonResponse({ error: 'mensagem enviada, mas houve erro ao registrar no banco.' }, 500);
  }

  return jsonResponse({ id_mensagem: mensagemRow.id, id_externo: idExterno }, 200);
});

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
