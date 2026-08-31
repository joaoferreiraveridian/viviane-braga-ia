-- Superfície de controle e monitoramento do agente, pedida pelo João em 30/08:
-- ligar/desligar a IA por CONVERSA, ver as execuções daquela conversa em tempo
-- real, e filtrar melhor a aba Execuções.
--
-- Continua valendo o escopo enxuto: nada disso é CRM. É só enxergar e mandar
-- no agente.
--
-- Tudo entra por `api` (o único schema exposto) e com grant para
-- `authenticated`, nunca `anon` — mesma regra da 0005. O app tem login desde
-- 30/08; `anon` segue sem enxergar nada.

-- ============================================================================
-- 1. Ligar/desligar a IA numa conversa específica
-- ============================================================================
-- O estado já existia: `core.agente_ia_estado.ia_ativa`, escrito pelos
-- comandos "#pausar"/"#voltar" do WhatsApp e lido pelo `whatsapp-webhook`
-- antes de enfileirar. O que faltava era poder mexer nisso pela tela — hoje
-- só dava mandando mensagem no chat.
--
-- A linha pode não existir (conversa que nunca foi pausada): o upsert cria.

create or replace function api.fn_agente_conversa_definir_ativa(
  p_conversa_id uuid,
  p_ativa boolean
) returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'core'
as $$
  insert into core.agente_ia_estado (pessoa_id, ia_ativa)
  values (p_conversa_id, p_ativa)
  on conflict (pessoa_id) do update
    set ia_ativa = excluded.ia_ativa, atualizado_em = now()
  returning ia_ativa;
$$;

revoke all on function api.fn_agente_conversa_definir_ativa(uuid, boolean) from public, anon;
grant execute on function api.fn_agente_conversa_definir_ativa(uuid, boolean) to authenticated;

-- Leitura do estado por conversa. `ia_ativa` ausente = ativa (é o default do
-- webhook: sem linha em agente_ia_estado, o agente atende).
create or replace view api.vw_agente_conversa_estado as
  select c.id                                    as conversa_id,
         coalesce(e.ia_ativa, true)              as ia_ativa,
         e.ia_memoria_desde,
         e.atualizado_em
    from public.whatsapp_conversas c
    left join core.agente_ia_estado e on e.pessoa_id = c.id;

revoke all on api.vw_agente_conversa_estado from public, anon;
grant select on api.vw_agente_conversa_estado to authenticated;

-- ============================================================================
-- 2. Execuções de UMA conversa (painel ao vivo dentro da thread)
-- ============================================================================
-- Enxuta de propósito: o que dá para ler de relance enquanto a conversa
-- acontece. O detalhe completo continua na aba Execuções.
create or replace view api.vw_agente_conversa_execucao as
  select r.id            as run_id,
         r.pessoa_id     as conversa_id,
         r.status,
         r.input_text,
         r.output_text,
         r.error,
         r.latency_ms,
         r.total_tokens,
         r.cost_usd,
         r.created_at,
         r.finished_at,
         (select count(*)::int from core.agente_ia_run_step s where s.run_id = r.id) as total_steps,
         coalesce((select array_agg(distinct s.tool_name) from core.agente_ia_run_step s
                    where s.run_id = r.id and s.tool_name is not null), '{}') as ferramentas_usadas
    from core.agente_ia_run r;

revoke all on api.vw_agente_conversa_execucao from public, anon;
grant select on api.vw_agente_conversa_execucao to authenticated;

-- ============================================================================
-- 3. Realtime das execuções
-- ============================================================================
-- View não entra em publicação de replicação, então o realtime assina a
-- tabela `core.agente_ia_run` direto — e o frontend usa o evento apenas como
-- SINAL para reconsultar a view acima (que é curada e enxuta).
--
-- ponytail: o payload do realtime carrega a linha inteira, incluindo
-- `system_prompt_snapshot` (~18 KB), ~3 vezes por run (pending -> running ->
-- succeeded). Para um operador olhando uma conversa é irrelevante. Se um dia
-- incomodar, mover o snapshot para uma tabela lateral
-- (core.agente_ia_run_prompt) deixa a linha magra para sempre — mexe em
-- agente-run e nas funções de api, por isso não foi feito agora.
-- Idempotente: `alter publication ... add table` é erro se a tabela já está
-- na publicação, e esta migração precisa poder rodar de novo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'core' and tablename = 'agente_ia_run'
  ) then
    alter publication supabase_realtime add table core.agente_ia_run;
  end if;
end $$;

-- Realtime aplica RLS como o usuário logado: sem policy, nenhum evento chega.
alter table core.agente_ia_run enable row level security;

drop policy if exists "leitura autenticada" on core.agente_ia_run;
create policy "leitura autenticada" on core.agente_ia_run
  for select to authenticated using (true);

grant usage on schema core to authenticated;
grant select on core.agente_ia_run to authenticated;

-- `core` NÃO entra em Exposed schemas do PostgREST — este grant serve só ao
-- canal de realtime. O acesso por HTTP continua sendo pelas views de `api`.

-- ============================================================================
-- 4. Filtros da aba Execuções
-- ============================================================================
-- `p_apenas_erros` era o único filtro além do período, e é grosso demais:
-- não dá para ver só as falhas de uma pessoa, nem só as runs que chamaram
-- `notificacao`. Os três novos parâmetros têm default, então a chamada antiga
-- de 4 argumentos continua válida.
--
-- Precisa de DROP porque acrescentar parâmetro muda a assinatura — CREATE OR
-- REPLACE não faz isso. O grant é refeito no fim (a 0005 dava a authenticated).
drop function if exists api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer);

create function api.fn_agente_execucao_lista(
  p_desde timestamptz,
  p_ate timestamptz,
  p_apenas_erros boolean default false,
  p_limite integer default 200,
  p_status text[] default null,      -- null = todos
  p_busca text default null,         -- nome do lead, telefone ou trecho da mensagem
  p_ferramenta text default null     -- 'think' | 'notificacao' | ...
) returns table(
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
     and (p_status is null or r.status = any (p_status))
     and (
       p_busca is null or p_busca = ''
       or p.nome        ilike '%' || p_busca || '%'
       or r.input_text  ilike '%' || p_busca || '%'
       or r.output_text ilike '%' || p_busca || '%'
       -- Telefone comparado só por dígitos: a busca aceita "(21) 97729-7413"
       -- e o banco guarda "+5521977297413". Mesma lição da 0008.
       -- O parêntese e o teste `<> ''` são obrigatórios: sem eles, uma busca
       -- sem dígito nenhum vira `like '%%'` e casa com TUDO, e o `and` teria
       -- precedência sobre os `or` acima.
       or (
            regexp_replace(p_busca, '\D', '', 'g') <> ''
        and regexp_replace(coalesce(r.telefone_e164, ''), '\D', '', 'g')
              like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
          )
     )
     and (
       p_ferramenta is null or p_ferramenta = '' or
       exists (select 1 from core.agente_ia_run_step s
                where s.run_id = r.id and s.tool_name = p_ferramenta)
     )
   order by r.created_at desc   -- historico sempre do mais recente
   limit p_limite;
$$;

revoke all on function api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer, text[], text, text) from public, anon;
grant execute on function api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer, text[], text, text) to authenticated;
