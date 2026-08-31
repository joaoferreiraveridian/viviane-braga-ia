-- Interruptor geral do agente, pela tela.
--
-- `core.agente_ia_config.enabled` sempre foi o único ponto que decide se o
-- agente atende alguém: o flush faz `continue` em tudo quando ele é false.
-- Até aqui só dava para mexer por SQL, o que na prática significava me chamar.
--
-- O cron fica ligado e inerte: com `enabled = false` o flush roda a cada 10s e
-- não faz nada. Assim ligar o agente é UM clique, sem precisar mexer no cron —
-- que é justamente o que o João pediu para poder virar a chave amanhã sozinho.
--
-- Não expõe `somente_test_phones` nem os telefones de teste: a trava foi
-- removida em 30/08 (o agente atende todo mundo) e reintroduzir isso na tela
-- só criaria um segundo jeito de meia-desligar o agente. Um interruptor.

create or replace function api.fn_agente_definir_enabled(p_enabled boolean)
returns boolean
language sql
security definer
set search_path to 'pg_catalog', 'core'
as $$
  update core.agente_ia_config
     set enabled = p_enabled, atualizado_em = now()
   where canal_codigo = 'whatsapp'
  returning enabled;
$$;

revoke all on function api.fn_agente_definir_enabled(boolean) from public, anon;
grant execute on function api.fn_agente_definir_enabled(boolean) to authenticated;
