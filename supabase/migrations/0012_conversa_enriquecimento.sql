-- Dados do lead para a LISTA de conversas.
--
-- A lista mostrava só nome, prévia, hora e não lidas — e o nome caía para o
-- telefone quando o WhatsApp não mandava push_name, então em metade das linhas
-- não dava para saber quem era nem de onde veio.
--
-- O que falta não está em `whatsapp_conversas`: a origem do anúncio mora na
-- MENSAGEM do clique (colunas `fonte`/`texto_anuncio`, migração 0010) e o
-- liga/desliga da IA mora em `core.agente_ia_estado` (0011). Esta view junta
-- as três coisas por conversa, para a lista fazer UMA consulta em vez de três.
--
-- Continua não sendo CRM: nada de etapa, dono ou pipeline. É identificar quem
-- está falando e se a IA está atendendo.

create or replace view api.vw_conversa_enriquecimento as
  select c.id as conversa_id,
         -- Origem do anúncio: vem só na mensagem do clique (CTWA), então
         -- pegamos a PRIMEIRA mensagem da conversa que tenha o dado. Uma vez
         -- que o lead veio de anúncio, isso vale para a conversa inteira.
         anuncio.fonte,
         anuncio.texto_anuncio,
         -- Sem linha em agente_ia_estado o agente atende: o default do
         -- webhook é atender, então `true`.
         coalesce(e.ia_ativa, true) as ia_ativa,
         totais.mensagens,
         totais.primeiro_contato
    from public.whatsapp_conversas c
    left join core.agente_ia_estado e on e.pessoa_id = c.id
    left join lateral (
      select m.fonte, m.texto_anuncio
        from public.whatsapp_mensagens m
       where m.conversa_id = c.id
         and (m.fonte is not null or m.texto_anuncio is not null)
       order by m.ocorrido_em
       limit 1
    ) anuncio on true
    left join lateral (
      select count(*)::int as mensagens, min(m.ocorrido_em) as primeiro_contato
        from public.whatsapp_mensagens m
       where m.conversa_id = c.id
    ) totais on true;

revoke all on api.vw_conversa_enriquecimento from public, anon;
grant select on api.vw_conversa_enriquecimento to authenticated;
