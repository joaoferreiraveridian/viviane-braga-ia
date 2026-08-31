-- `test_phones` nasce sem o "+" (`default array['5521977297413']`, migração
-- 0002) e o buffer guarda o telefone em E.164 COM o "+" (`normalizePhoneE164`
-- devolve "+55..."). A comparação de 0007 era literal:
--
--     v_group.telefone_e164 = any (coalesce(v_config.test_phones, '{}'))
--
-- ou seja, '+5521977297413' = '5521977297413' -> false, sempre. Com
-- somente_test_phones = true isso trava TUDO: nem o telefone de teste vira
-- run, e em silêncio — o loop só faz `continue`, não há erro nem linha de log.
--
-- Correção na comparação, não no dado: normalizar os dois lados para dígitos
-- resolve para qualquer formato que alguém digite no futuro na tela de
-- agentes ("+55 21 97729-7413", "5521977297413", "(21) 97729-7413").
-- É o único ponto do banco que compara telefone com test_phones.

CREATE OR REPLACE FUNCTION core.agente_ia_flush_due_buffers()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core'
AS $function$
declare
  v_group       record;
  v_locked_ids  uuid[];
  v_locked_max  timestamptz;
  v_input_text  text;
  v_message_ids text[];
  v_config      record;
  v_interval    interval;
  v_run_id      uuid;
  v_edge_url    text;
  v_service_key text;
  v_eh_teste    boolean;
begin
  for v_group in (
    select b.pessoa_id,
           max(b.telefone_e164) as telefone_e164,
           max(b.received_at)   as last_received_at
      from core.agente_ia_mensagem_buffer b
     where b.consumed_at is null
     group by b.pessoa_id
  )
  loop
    select c.debounce_seconds, c.debounce_seconds_test, c.test_phones, c.enabled,
           c.model, c.provider, c.system_prompt, c.somente_test_phones
      into v_config
      from core.agente_ia_config c
     where c.canal_codigo = 'whatsapp';

    if not found or not v_config.enabled then
      continue;
    end if;

    -- Só dígitos dos dois lados: o buffer traz "+55...", test_phones costuma
    -- vir sem "+" e pode vir formatado pela tela.
    v_eh_teste := regexp_replace(v_group.telefone_e164, '\D', '', 'g') = any (
                    select regexp_replace(t, '\D', '', 'g')
                      from unnest(coalesce(v_config.test_phones, '{}')) as t
                  );

    -- Trava de teste: fora da lista de teste, nem chega a virar run.
    if v_config.somente_test_phones and not v_eh_teste then
      continue;
    end if;

    if v_eh_teste then
      v_interval := (coalesce(v_config.debounce_seconds_test, 1) || ' seconds')::interval;
    else
      v_interval := (coalesce(v_config.debounce_seconds, 30) || ' seconds')::interval;
    end if;

    if v_group.last_received_at > now() - v_interval then
      continue;
    end if;

    select array_agg(id order by received_at),
           array_agg(message_id order by received_at) filter (where message_id is not null),
           string_agg(content, E'\n' order by received_at),
           max(received_at)
      into v_locked_ids, v_message_ids, v_input_text, v_locked_max
      from (
        select id, message_id, content, received_at
          from core.agente_ia_mensagem_buffer
         where pessoa_id = v_group.pessoa_id
           and consumed_at is null
         for update skip locked
      ) as locked_rows;

    if v_locked_ids is null then
      continue;
    end if;

    -- Recheca sob o lock: chegou mensagem nova durante o flush -> desiste
    -- desta rodada, o proximo tick junta tudo.
    if v_locked_max > now() - v_interval then
      continue;
    end if;

    v_run_id := gen_random_uuid();

    insert into core.agente_ia_run (
      id, pessoa_id, telefone_e164, trigger_message_ids, input_text,
      status, model, provider, system_prompt_snapshot, created_at
    ) values (
      v_run_id, v_group.pessoa_id, v_group.telefone_e164,
      coalesce(v_message_ids, '{}'), v_input_text,
      'pending', v_config.model, v_config.provider, v_config.system_prompt, now()
    );

    update core.agente_ia_mensagem_buffer
       set consumed_at = now(), run_id = v_run_id
     where id = any (v_locked_ids);

    v_edge_url    := core.fn_agente_ia_secret('agente_ia_edge_url');
    v_service_key := core.fn_agente_ia_secret('agente_ia_service_role_key');

    if v_edge_url is null or v_service_key is null then
      update core.agente_ia_run
         set error = 'agente_ia_edge_url / agente_ia_service_role_key nao configurados no Vault',
             status = 'failed'
       where id = v_run_id;
      continue;
    end if;

    perform net.http_post(
      url     := rtrim(v_edge_url, '/') || '/agente-run',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || v_service_key
                 ),
      body    := jsonb_build_object('run_id', v_run_id)
    );
  end loop;
end;
$function$
;

revoke execute on function core.agente_ia_flush_due_buffers() from public, anon, authenticated;
