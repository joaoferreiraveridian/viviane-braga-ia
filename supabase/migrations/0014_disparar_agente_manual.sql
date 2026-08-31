-- Disparo MANUAL do agente numa conversa.
--
-- Pedido do João em 30/08: poder testar o agente em um lead específico sem
-- ligar o interruptor geral, que ligaria para todos os leads de anúncio ao
-- mesmo tempo.
--
-- Diferença para `core.agente_ia_flush_due_buffers()`: esta função IGNORA de
-- propósito todos os portões automáticos —
--   `enabled`               (o agente pode estar desligado: é esse o ponto)
--   `somente_test_phones`   (a trava já saiu, mas se voltar não vale aqui)
--   `ia_ativa` da conversa  (pausar é para o automático; isto é ação humana)
--   o debounce              (o operador clicou agora, não espera 30s)
-- porque quem dispara é uma pessoa logada, olhando a conversa. Os portões
-- existem para decidir o que o robô faz sozinho.
--
-- O que ela NÃO ignora: a fila real. Se houver mensagens não consumidas no
-- buffer daquela conversa, é EXATAMENTE isso que vira a run — mesmo caminho do
-- flush. Assim o teste manual exercita o fluxo de verdade, não um atalho.

create or replace function api.fn_agente_disparar(p_conversa_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'core', 'public'
as $$
declare
  v_config      record;
  v_locked_ids  uuid[];
  v_message_ids text[];
  v_input_text  text;
  v_telefone    text;
  v_run_id      uuid;
  v_edge_url    text;
  v_service_key text;
begin
  select c.provider, c.model, c.system_prompt
    into v_config
    from core.agente_ia_config c
   where c.canal_codigo = 'whatsapp';

  if not found then
    raise exception 'Configuração do agente não encontrada.';
  end if;

  -- 1) Preferência: o que está na fila daquela conversa, igual ao flush.
  select array_agg(id order by received_at),
         array_agg(message_id order by received_at) filter (where message_id is not null),
         string_agg(content, E'\n' order by received_at),
         max(telefone_e164)
    into v_locked_ids, v_message_ids, v_input_text, v_telefone
    from (
      select id, message_id, content, received_at, telefone_e164
        from core.agente_ia_mensagem_buffer
       where pessoa_id = p_conversa_id
         and consumed_at is null
       for update skip locked
    ) as pendentes;

  -- 2) Fila vazia (já consumida, ou conversa antiga): usa a ÚLTIMA mensagem
  --    recebida do lead. É o que o operador espera ao clicar "disparar" numa
  --    conversa parada — responder ao que a pessoa falou por último.
  if v_input_text is null then
    select m.conteudo, c.contato_telefone
      into v_input_text, v_telefone
      from public.whatsapp_mensagens m
      join public.whatsapp_conversas c on c.id = m.conversa_id
     where m.conversa_id = p_conversa_id
       and m.direcao = 'entrada'
       and m.conteudo is not null
     order by m.ocorrido_em desc
     limit 1;
  end if;

  if v_input_text is null or btrim(v_input_text) = '' then
    raise exception 'Não há mensagem do lead para o agente responder nesta conversa.';
  end if;

  v_run_id := gen_random_uuid();

  insert into core.agente_ia_run (
    id, pessoa_id, telefone_e164, trigger_message_ids, input_text,
    status, model, provider, system_prompt_snapshot, created_at
  ) values (
    v_run_id, p_conversa_id, v_telefone,
    coalesce(v_message_ids, '{}'), v_input_text,
    'pending', v_config.model, v_config.provider, v_config.system_prompt, now()
  );

  -- Só marca consumido o que realmente entrou nesta run.
  if v_locked_ids is not null then
    update core.agente_ia_mensagem_buffer
       set consumed_at = now(), run_id = v_run_id
     where id = any (v_locked_ids);
  end if;

  v_edge_url    := core.fn_agente_ia_secret('agente_ia_edge_url');
  v_service_key := core.fn_agente_ia_secret('agente_ia_service_role_key');

  if v_edge_url is null or v_service_key is null then
    update core.agente_ia_run
       set error = 'agente_ia_edge_url / agente_ia_service_role_key nao configurados no Vault',
           status = 'failed'
     where id = v_run_id;
    return v_run_id;
  end if;

  perform net.http_post(
    url     := rtrim(v_edge_url, '/') || '/agente-run',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_service_key
               ),
    -- `manual` faz a agente-run ignorar o botão de segurança `enabled`.
    -- Sem isto a run nasce 'skipped' com o agente desligado — que é
    -- exatamente o cenário em que este disparo precisa funcionar.
    body    := jsonb_build_object('run_id', v_run_id, 'manual', true)
  );

  return v_run_id;
end;
$$;

revoke all on function api.fn_agente_disparar(uuid) from public, anon;
grant execute on function api.fn_agente_disparar(uuid) to authenticated;
