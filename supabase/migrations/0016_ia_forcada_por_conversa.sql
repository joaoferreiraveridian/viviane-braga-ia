-- "IA atendendo" da conversa vira um interruptor de verdade.
--
-- Pedido do João em 30/08: com o agente global DESLIGADO, ligar a chave numa
-- conversa específica deve fazer a IA atender aquele lead de verdade, turno a
-- turno — e todo o resto continua parado. Era o que faltava para testar uma
-- conversa inteira sem clicar "Disparar IA" a cada resposta do lead.
--
-- Por que uma coluna nova e não reusar `ia_ativa`: `ia_ativa` nasce `true`
-- (sem linha = atende) e serve para PAUSAR. Se "true" virasse "força", TODA
-- conversa passaria pelo portão com o agente desligado — o oposto do pedido.
-- `ia_forcada` nasce `false`: só entra quem foi ligado à mão.
--
-- Precedência final:
--   ia_ativa = false                    -> nunca atende (pausa vence tudo)
--   enabled = true                      -> atende (regra normal)
--   enabled = false e ia_forcada = true -> atende SÓ esta conversa
--   enabled = false e ia_forcada = false-> não atende
--
-- O override também vence o portão de anúncio (no webhook) e a trava de
-- telefone de teste: ligar a chave à mão é ato deliberado de quem está logado
-- olhando a conversa, mesma lógica do botão "Disparar IA" (0014).

alter table core.agente_ia_estado
  add column if not exists ia_forcada boolean not null default false;

comment on column core.agente_ia_estado.ia_forcada is
  'Ligada à mão na tela: faz a IA atender ESTA conversa mesmo com core.agente_ia_config.enabled = false. Nasce false — só entra quem foi ligado explicitamente.';

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
  v_forcada     boolean;
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

    if not found then
      continue;
    end if;

    -- Override por CONVERSA (migração 0016). `ia_forcada` é a chave "IA
    -- atendendo" ligada à mão numa conversa: com o interruptor geral
    -- desligado, só as conversas forçadas são atendidas — o resto do mundo
    -- fica realmente parado. É diferente de `ia_ativa`, que nasce true e só
    -- serve para PAUSAR; forçar precisa ser um ato explícito, senão toda
    -- conversa (que é ia_ativa=true por default) passaria pelo portão.
    select coalesce(e.ia_forcada, false)
      into v_forcada
      from core.agente_ia_estado e
     where e.pessoa_id = v_group.pessoa_id;
    v_forcada := coalesce(v_forcada, false);

    if not v_config.enabled and not v_forcada then
      continue;
    end if;

    -- Só dígitos dos dois lados: o buffer traz "+55...", test_phones costuma
    -- vir sem "+" e pode vir formatado pela tela.
    v_eh_teste := regexp_replace(v_group.telefone_e164, '\D', '', 'g') = any (
                    select regexp_replace(t, '\D', '', 'g')
                      from unnest(coalesce(v_config.test_phones, '{}')) as t
                  );

    -- Trava de teste: fora da lista de teste, nem chega a virar run.
    if v_config.somente_test_phones and not v_eh_teste and not v_forcada then
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
$function$;


revoke execute on function core.agente_ia_flush_due_buffers() from public, anon, authenticated;

-- ============================================================================
-- O toggle da conversa passa a mexer nos DOIS campos
-- ============================================================================
-- Ligar  = "quero a IA atendendo este lead"  -> despausa E força.
-- Desligar = "não quero"                      -> pausa E tira a força.
-- Um clique, um significado. Sem isso o operador teria dois botões para
-- responder à mesma pergunta ("a IA atende este lead?").
create or replace function api.fn_agente_conversa_definir_ativa(
  p_conversa_id uuid,
  p_ativa boolean
) returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'core'
as $$
  insert into core.agente_ia_estado (pessoa_id, ia_ativa, ia_forcada)
  values (p_conversa_id, p_ativa, p_ativa)
  on conflict (pessoa_id) do update
    set ia_ativa = excluded.ia_ativa,
        ia_forcada = excluded.ia_forcada,
        atualizado_em = now()
  returning ia_ativa;
$$;

revoke all on function api.fn_agente_conversa_definir_ativa(uuid, boolean) from public, anon;
grant execute on function api.fn_agente_conversa_definir_ativa(uuid, boolean) to authenticated;

-- ============================================================================
-- Estado EFETIVO por conversa
-- ============================================================================
-- A tela mostrava `ia_ativa` cru e dizia "IA atendendo" mesmo com o agente
-- global desligado — mentira que confundiu na prática. `atendendo` abaixo é a
-- verdade: se está false, nenhuma mensagem desta conversa vira resposta.
create or replace view api.vw_agente_conversa_estado as
  select c.id                              as conversa_id,
         -- ATENÇÃO: colunas novas só podem ser ACRESCENTADAS no fim.
         -- `create or replace view` recusa reordenar ou renomear (42P16) —
         -- errei isto três vezes hoje. A ordem daqui até `atualizado_em` é a
         -- da view original; `ia_forcada` e `atendendo` vêm depois.
         coalesce(e.ia_ativa, true)        as ia_ativa,
         e.ia_memoria_desde,
         e.atualizado_em,
         coalesce(e.ia_forcada, false)     as ia_forcada,
         (
           coalesce(e.ia_ativa, true)
           and (cfg.enabled or coalesce(e.ia_forcada, false))
           and (
                 coalesce(e.ia_forcada, false)
              or not cfg.somente_leads_anuncio
              or core.fn_conversa_veio_de_anuncio(c.id)
           )
         )                                 as atendendo
    from public.whatsapp_conversas c
    left join core.agente_ia_estado e on e.pessoa_id = c.id
    cross join (
      select enabled, somente_leads_anuncio
        from core.agente_ia_config where canal_codigo = 'whatsapp'
    ) cfg;

revoke all on api.vw_agente_conversa_estado from public, anon;
grant select on api.vw_agente_conversa_estado to authenticated;
