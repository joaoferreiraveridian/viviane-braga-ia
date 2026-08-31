-- A regra de anúncio passa a ser ABSOLUTA para atendimento automático.
--
-- Correção de uma decisão errada minha na 0016: lá eu fiz `ia_forcada` vencer
-- também o portão de anúncio, com o argumento "é ato deliberado de quem está
-- logado". Na prática deu o oposto do que o João pediu:
--
--   - a tela estava mostrando o estado errado (bug de grant, 0015/0017) e
--     exibia "IA não atende" em conversas que a IA atendia;
--   - ao clicar para "ligar", o toggle gravava ia_forcada = true;
--   - com isso a CECY FELICIO, cliente ANTIGA e sem origem de anúncio, foi
--     atendida duas vezes (runs 11:11 e 11:15) pelo agente comercial.
--
-- O toggle da conversa juntava dois significados diferentes:
--   1. "esta conversa está pausada?"           (pausa)
--   2. "esta conversa fura a regra de anúncio?" (isenção)
-- Ninguém pediu 2. O pedido foi: com o agente global DESLIGADO, ligar a chave
-- numa conversa faz a IA atender AQUELE lead.
--
-- Nova precedência, para atendimento AUTOMÁTICO:
--   ia_ativa = false            -> nunca atende
--   não veio de anúncio         -> nunca atende  (absoluto, e é a regra do João)
--   enabled = true              -> atende
--   enabled = false + ia_forcada-> atende só esta conversa
--
-- O único caminho que fura a regra de anúncio continua sendo o botão
-- "Disparar IA" (api.fn_agente_disparar, 0014): explícito, um turno, e quem
-- clica está olhando a conversa.

-- 1) Limpa as isenções criadas por engano enquanto a tela mentia. Só as de
--    conversa SEM origem de anúncio — as de lead de anúncio são legítimas e
--    continuam valendo para quando o interruptor geral estiver desligado.
update core.agente_ia_estado e
   set ia_forcada = false, atualizado_em = now()
 where e.ia_forcada
   and not core.fn_conversa_veio_de_anuncio(e.pessoa_id);

-- 2) O estado efetivo passa a tratar anúncio como condição obrigatória.
create or replace view api.vw_agente_conversa_estado as
  select c.id                              as conversa_id,
         coalesce(e.ia_ativa, true)        as ia_ativa,
         e.ia_memoria_desde,
         e.atualizado_em,
         coalesce(e.ia_forcada, false)     as ia_forcada,
         (
           coalesce(e.ia_ativa, true)
           -- override vence o interruptor geral...
           and (cfg.enabled or coalesce(e.ia_forcada, false))
           -- ...mas NÃO a regra de anúncio.
           and (not cfg.somente_leads_anuncio or core.fn_conversa_veio_de_anuncio(c.id))
         )                                 as atendendo
    from public.whatsapp_conversas c
    left join core.agente_ia_estado e on e.pessoa_id = c.id
    cross join (
      select enabled, somente_leads_anuncio
        from core.agente_ia_config where canal_codigo = 'whatsapp'
    ) cfg;

revoke all on api.vw_agente_conversa_estado from public, anon;
grant select on api.vw_agente_conversa_estado to authenticated;
