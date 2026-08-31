-- Só lead de anúncio é atendido pela IA.
--
-- REGRA NOVA, decidida pelo João em 30/08 — NÃO é comportamento do n8n. O
-- fluxo antigo atendia todo mundo (a dissecação confirma: nenhum portão do
-- export olhava origem de anúncio; a linha 32 do prompt antigo até tratava
-- "fonte orgânica"). Aqui a regra é outra: quem não veio de anúncio não recebe
-- resposta automática nenhuma.
--
-- O caso que motivou: CECY FELICIO, cliente ANTIGA, pediu de manhã o link para
-- reassinar um documento. Sem esta regra, ao ligar o interruptor geral ela
-- receberia o script de qualificação de superendividamento de uma assistente
-- que não a conhece.
--
-- Como se sabe que veio de anúncio: `whatsapp_mensagens.fonte` /
-- `texto_anuncio` (migração 0010), preenchidos pelo webhook a partir de
-- `contextInfo.conversionSource` / `externalAdReply.body`. O WhatsApp só manda
-- isso na mensagem do CLIQUE no anúncio, então a marca vale para a conversa
-- inteira: basta UMA mensagem com origem para o lead ser de anúncio para
-- sempre.
--
-- Flag em vez de regra fixa no código: espelha `somente_test_phones`, e deixa
-- desligar sem deploy se um dia o escritório quiser atender orgânico de novo.

alter table core.agente_ia_config
  add column if not exists somente_leads_anuncio boolean not null default true;

comment on column core.agente_ia_config.somente_leads_anuncio is
  'Quando true, o webhook só enfileira mensagens de conversas que vieram de anúncio (whatsapp_mensagens.fonte/texto_anuncio). Regra do João, 30/08 — não é comportamento do n8n.';

update core.agente_ia_config
   set somente_leads_anuncio = true, atualizado_em = now()
 where canal_codigo = 'whatsapp';

-- Saber se uma conversa veio de anúncio. Usada pelo webhook antes de
-- enfileirar.
create or replace function core.fn_conversa_veio_de_anuncio(p_conversa_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select exists (
    select 1 from public.whatsapp_mensagens m
     where m.conversa_id = p_conversa_id
       and (m.fonte is not null or m.texto_anuncio is not null)
  );
$$;

revoke all on function core.fn_conversa_veio_de_anuncio(uuid) from public, anon, authenticated;

-- A view ganha a coluna nova NO FIM.
--
-- `create or replace view` só permite ACRESCENTAR coluna no fim: qualquer
-- reordenação, remoção — ou omitir uma coluna existente por descuido — dá
-- 42P16 "cannot drop columns from view". Foi o erro que cometi duas vezes ao
-- reescrever esta view de cabeça: faltavam `memoria_janela_mensagens`,
-- `comando_pausar`, `comando_voltar`, `comando_zerar_memoria` e
-- `etiqueta_bloqueio`. A lista abaixo é cópia fiel de
-- `pg_get_viewdef('api.vw_agente_config')` mais a coluna nova.
create or replace view api.vw_agente_config as
  select id                     as config_id,
         null::uuid             as organization_id,
         provider,
         model,
         temperature,
         system_prompt,
         debounce_seconds,
         debounce_seconds_test,
         test_phones,
         memoria_janela_mensagens,
         comando_pausar,
         comando_voltar,
         comando_zerar_memoria,
         etiqueta_bloqueio,
         enabled,
         criado_em              as created_at,
         atualizado_em          as updated_at,
         somente_leads_anuncio
    from core.agente_ia_config c;

revoke all on api.vw_agente_config from public, anon;
grant select on api.vw_agente_config to authenticated;
