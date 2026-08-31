-- =============================================================================
-- Fundacao do agente de IA em Postgres puro (substitui o n8n).
-- Adaptado de skills/agente-n8n-supabase/template/sql/01-agente.sql:
--   __CANAL__ -> 'whatsapp'; debounce 30s/1s (telefone de teste 5521977297413);
--   janela de memoria 15 mensagens; comandos de operacao #pausar/#voltar/#zerar;
--   bloqueio por etiqueta do WhatsApp (wa_label); vw_agente_pessoa aponta para
--   public.whatsapp_conversas -- pessoa_id = conversa_id, de proposito, para a
--   run na aba Execucoes ser a mesma entidade da thread em Conversas.
-- =============================================================================
-- Nada aqui depende de Redis, fila externa ou servico de agendamento: buffer,
-- debounce, fila e log vivem em tabela. O unico externo e o LLM.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists core;
create schema if not exists api;

-- -----------------------------------------------------------------------------
-- 1. Configuracao -- o "prompt unico" e os parametros do modelo
-- -----------------------------------------------------------------------------
create table if not exists core.agente_ia_config (
  id                    uuid primary key default gen_random_uuid(),
  canal_codigo          text not null default 'whatsapp',
  provider              text not null default 'openrouter',
  model                 text not null,
  temperature           numeric not null default 0.3,
  system_prompt         text not null,
  debounce_seconds      integer not null default 30,
  debounce_seconds_test integer not null default 1,
  test_phones           text[] not null default array['5521977297413'],
  -- Janela de memoria: quantas ultimas mensagens da conversa entram no
  -- contexto do agente (equivalente ao contextWindowLength do n8n).
  memoria_janela_mensagens integer not null default 15,
  -- Comandos de operacao digitados pelo atendente humano no proprio chat.
  -- No n8n eram "Oi!" (bug -- saudacao natural pausava a IA) e "!voltar";
  -- aqui viram comandos que ninguem digita por acidente.
  comando_pausar        text not null default '#pausar',
  comando_voltar        text not null default '#voltar',
  comando_zerar_memoria text not null default '#zerar',
  -- Etiqueta do WhatsApp (wa_label) que marca "nao atender" -- normalmente
  -- "<numero_da_instancia>:<id_etiqueta>". Vazio/null = bloqueio desativado.
  etiqueta_bloqueio     text default '5521968482967:13',
  -- Botao de seguranca: enquanto false, runs sao criadas e marcadas 'skipped'
  -- pelo agente-run, sem nenhuma mensagem sair. E assim que se testa em
  -- producao sem risco de responder cliente.
  enabled               boolean not null default false,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);
create unique index if not exists agente_ia_config_canal_uk on core.agente_ia_config (canal_codigo);

-- -----------------------------------------------------------------------------
-- 2. Ferramentas -- so descricao e liga/desliga; o formato e contrato de codigo
-- -----------------------------------------------------------------------------
create table if not exists core.agente_ia_tool (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  description   text,
  enabled       boolean not null default true,
  schema        jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. Estado por pessoa -- IA ligada/desligada, pausa, corte de memoria
-- -----------------------------------------------------------------------------
create table if not exists core.agente_ia_estado (
  id                uuid primary key default gen_random_uuid(),
  pessoa_id         uuid not null unique,
  ia_ativa          boolean not null default true,
  ia_paused_until   timestamptz,
  -- Corte de memoria: o agente ignora historico anterior a esta data.
  ia_memoria_desde  timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists core.agente_ia_escalacao (
  id        uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null,
  run_id    uuid,
  resumo    text not null,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. Buffer de debounce -- o substituto da LIST do Redis
-- -----------------------------------------------------------------------------
create table if not exists core.agente_ia_mensagem_buffer (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null,
  telefone_e164 text,
  content       text not null,
  message_id    text,
  received_at   timestamptz not null default now(),
  consumed_at   timestamptz,
  run_id        uuid
);
-- Idempotencia do webhook: a mesma mensagem entregue duas vezes nao duplica.
create unique index if not exists agente_ia_buffer_msg_uk
  on core.agente_ia_mensagem_buffer (pessoa_id, message_id) where message_id is not null;
create index if not exists agente_ia_buffer_pendente_ix
  on core.agente_ia_mensagem_buffer (pessoa_id, received_at) where consumed_at is null;

-- -----------------------------------------------------------------------------
-- 5. Ledger de execucao -- e a aba "Execucoes" da tela
-- -----------------------------------------------------------------------------
create table if not exists core.agente_ia_run (
  id                     uuid primary key default gen_random_uuid(),
  pessoa_id              uuid not null,
  telefone_e164          text,
  input_text             text,
  status                 text not null default 'pending'
                           check (status in ('pending','running','succeeded','failed','skipped')),
  model                  text,
  provider               text,
  -- Snapshot do prompt no momento da run: sem isso nao da para auditar por
  -- que o agente respondeu daquele jeito depois que o prompt muda.
  system_prompt_snapshot text,
  trigger_message_ids    text[] not null default '{}',
  output_text            text,
  finish_reason          text,
  prompt_tokens          integer,
  completion_tokens      integer,
  total_tokens           integer,
  cost_usd               numeric,
  latency_ms             integer,
  error                  text,
  started_at             timestamptz,
  finished_at            timestamptz,
  created_at             timestamptz not null default now()
);
create index if not exists agente_ia_run_created_ix on core.agente_ia_run (created_at desc);
create index if not exists agente_ia_run_pessoa_ix on core.agente_ia_run (pessoa_id, created_at desc);

create table if not exists core.agente_ia_run_step (
  id         bigint generated always as identity primary key,
  run_id     uuid not null references core.agente_ia_run(id) on delete cascade,
  step_index integer not null,
  step_type  text not null
               check (step_type in ('llm_call','tool_call','tool_result','thinking','send_message','error')),
  tool_name  text,
  input      jsonb,
  output     jsonb,
  tokens     integer,
  latency_ms integer,
  error      text,
  criado_em  timestamptz not null default now()
);
create index if not exists agente_ia_run_step_run_ix on core.agente_ia_run_step (run_id, step_index);

alter table core.agente_ia_config           enable row level security;
alter table core.agente_ia_tool             enable row level security;
alter table core.agente_ia_estado           enable row level security;
alter table core.agente_ia_escalacao        enable row level security;
alter table core.agente_ia_mensagem_buffer  enable row level security;
alter table core.agente_ia_run              enable row level security;
alter table core.agente_ia_run_step         enable row level security;
-- Sem policy: so service_role (edge function) e SECURITY DEFINER entram.
-- A tela le pelas views do schema api, nunca pela tabela.

-- -----------------------------------------------------------------------------
-- 6. Segredos (Vault) -- url da edge e service key, para o pg_net chamar
-- -----------------------------------------------------------------------------
create or replace function core.fn_agente_ia_secret(p_name text)
returns text
language sql
security definer
set search_path to 'pg_catalog', 'vault'
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;
-- OBRIGATORIO: em projeto Supabase com ALTER DEFAULT PRIVILEGES no schema,
-- uma funcao SECURITY DEFINER nova pode nascer executavel por anon via
-- /rest/v1/rpc/. Revogar sempre, e conferir depois com has_function_privilege.
revoke all on function core.fn_agente_ia_secret(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Enfileirar (chamada pelo webhook de WhatsApp)
-- -----------------------------------------------------------------------------
create or replace function core.agente_ia_enqueue_message(
  p_pessoa_id uuid, p_telefone_e164 text, p_conteudo text, p_message_id text default null
) returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'core'
as $$
begin
  insert into core.agente_ia_estado (pessoa_id) values (p_pessoa_id)
  on conflict (pessoa_id) do nothing;

  insert into core.agente_ia_mensagem_buffer (pessoa_id, telefone_e164, content, message_id)
  values (p_pessoa_id, p_telefone_e164, p_conteudo, p_message_id)
  on conflict (pessoa_id, message_id) do nothing;
end;
$$;
revoke all on function core.agente_ia_enqueue_message(uuid, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8. Flush -- o debounce do n8n, sem Redis
-- -----------------------------------------------------------------------------
-- Reproduz o "compare-last" do n8n: em vez de esperar (30s/1s) dentro do
-- processo e comparar a lista no fim, aqui a espera e apenas "a ultima
-- mensagem do grupo e mais velha que o debounce?". Trava com FOR UPDATE SKIP
-- LOCKED e RECHECA sob o lock -- e a recheca que garante que uma mensagem
-- chegando durante o flush nao seja perdida nem responda pela metade. Mais
-- robusto que o original: se o processo cair, nada fica orfao, o proximo
-- tick reprocessa.
create or replace function core.agente_ia_flush_due_buffers()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'core'
as $$
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
           c.model, c.provider, c.system_prompt
      into v_config
      from core.agente_ia_config c
     where c.canal_codigo = 'whatsapp';

    if not found or not v_config.enabled then
      continue;
    end if;

    if v_group.telefone_e164 = any (coalesce(v_config.test_phones, '{}')) then
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
$$;
revoke all on function core.agente_ia_flush_due_buffers() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 9. Camada api -- unico caminho de leitura da tela
-- -----------------------------------------------------------------------------
-- Os nomes de coluna abaixo sao CONTRATO com o template de frontend
-- (use-agentes.ts). Mantem lead_id/lead_nome/lead_telefone/phone por
-- compatibilidade com os mapeadores da tela, mesmo lendo pessoa_id.
-- PONTE COM O PROJETO: a view abaixo e o UNICO ponto que conhece a tabela de
-- pessoa/contato. Neste projeto a tabela e public.whatsapp_conversas e o
-- agente usa conversa_id como pessoa_id -- e por isso que uma run na aba
-- Execucoes e a mesma entidade da thread em Conversas.
create or replace view core.vw_agente_pessoa as
  select id, contato_nome as nome from public.whatsapp_conversas;

create or replace function api.fn_agente_execucao_lista(
  p_desde timestamptz, p_ate timestamptz,
  p_apenas_erros boolean default false, p_limite integer default 200
) returns table (
  run_id uuid, lead_id uuid, lead_nome text, lead_telefone text, status text,
  model text, provider text, input_text text, output_text text, finish_reason text,
  total_tokens integer, prompt_tokens integer, completion_tokens integer,
  cost_usd numeric, latency_ms integer, error text,
  created_at timestamptz, started_at timestamptz, finished_at timestamptz,
  total_steps integer, ferramentas_usadas text[], partes_enviadas integer,
  ultimo_step_tipo text, ultimo_step_erro text
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'core'
as $$
  select r.id, r.pessoa_id, p.nome, r.telefone_e164, r.status,
         r.model, r.provider, r.input_text, r.output_text, r.finish_reason,
         r.total_tokens, r.prompt_tokens, r.completion_tokens,
         r.cost_usd, r.latency_ms, r.error,
         r.created_at, r.started_at, r.finished_at,
         (select count(*)::int from core.agente_ia_run_step s where s.run_id = r.id),
         coalesce((select array_agg(distinct s.tool_name) from core.agente_ia_run_step s
                    where s.run_id = r.id and s.tool_name is not null), '{}'),
         (select count(*)::int from core.agente_ia_run_step s
           where s.run_id = r.id and s.step_type = 'send_message'),
         (select s.step_type from core.agente_ia_run_step s
           where s.run_id = r.id order by s.step_index desc limit 1),
         (select s.error from core.agente_ia_run_step s
           where s.run_id = r.id and s.error is not null order by s.step_index desc limit 1)
    from core.agente_ia_run r
    left join core.vw_agente_pessoa p on p.id = r.pessoa_id
   where r.created_at between p_desde and p_ate
     and (not p_apenas_erros or r.status in ('failed','skipped') or r.error is not null)
   order by r.created_at desc   -- historico sempre do mais recente
   limit p_limite;
$$;

create or replace function api.fn_agente_execucao_resumo(p_desde timestamptz, p_ate timestamptz)
returns table (
  total_runs integer, succeeded integer, failed integer, skipped integer,
  pending integer, running integer, custo_total_usd numeric,
  tokens_totais bigint, latencia_media_ms numeric
)
language sql
stable
security definer
set search_path to 'pg_catalog', 'core'
as $$
  select count(*)::int,
         count(*) filter (where r.status = 'succeeded')::int,
         count(*) filter (where r.status = 'failed')::int,
         count(*) filter (where r.status = 'skipped')::int,
         count(*) filter (where r.status = 'pending')::int,
         count(*) filter (where r.status = 'running')::int,
         coalesce(sum(r.cost_usd), 0)::numeric,
         coalesce(sum(r.total_tokens), 0)::bigint,
         coalesce(avg(r.latency_ms), 0)::numeric
    from core.agente_ia_run r
   where r.created_at between p_desde and p_ate;
$$;

create or replace view api.vw_agente_execucao_passo as
  select s.id as passo_id, s.run_id, s.step_index, s.step_type, s.tool_name,
         s.input, s.output, s.tokens, s.latency_ms, s.error, s.criado_em as created_at
    from core.agente_ia_run_step s
   order by s.run_id, s.step_index;

create or replace view api.vw_agente_config as
  select c.id as config_id, null::uuid as organization_id, c.provider, c.model,
         c.temperature, c.system_prompt, c.debounce_seconds, c.debounce_seconds_test,
         c.test_phones, c.memoria_janela_mensagens, c.comando_pausar, c.comando_voltar,
         c.comando_zerar_memoria, c.etiqueta_bloqueio, c.enabled,
         c.criado_em as created_at, c.atualizado_em as updated_at
    from core.agente_ia_config c;

create or replace view api.vw_agente_tool as
  select t.id as tool_id, null::uuid as organization_id, t.name, t.description,
         t.enabled, t.schema, t.criado_em as created_at, t.atualizado_em as updated_at
    from core.agente_ia_tool t
   order by t.name;

create or replace view api.vw_agente_fila_pendente as
  select b.id as buffer_id, b.pessoa_id as lead_id, p.nome as lead_nome,
         b.telefone_e164 as phone, b.content, b.received_at, b.consumed_at, b.run_id
    from core.agente_ia_mensagem_buffer b
    left join core.vw_agente_pessoa p on p.id = b.pessoa_id
   where b.consumed_at is null
   order by b.received_at;

-- DROP VIEW ... CASCADE apaga grant: reconceder SEMPRE no fim da migration.
grant usage on schema api to authenticated;
grant select on api.vw_agente_execucao_passo, api.vw_agente_config,
                api.vw_agente_tool, api.vw_agente_fila_pendente to authenticated;
grant execute on function api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer) to authenticated;
grant execute on function api.fn_agente_execucao_resumo(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- 10. Cron -- NASCE PAUSADO. Ligar so na virada (desligando o workflow n8n
-- no mesmo instante -- um numero, um agente, nunca os dois ao mesmo tempo).
-- -----------------------------------------------------------------------------
select cron.schedule('agente_ia_flush', '10 seconds', $$select core.agente_ia_flush_due_buffers();$$);
select cron.alter_job((select jobid from cron.job where jobname = 'agente_ia_flush'), active := false);
