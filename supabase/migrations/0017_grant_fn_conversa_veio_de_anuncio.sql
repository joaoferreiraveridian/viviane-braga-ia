-- Correção de um erro meu na 0015.
--
-- Lá eu revoguei `execute` de `authenticated` em
-- core.fn_conversa_veio_de_anuncio, pensando "função de core, o webhook usa
-- com service_role, ninguém mais precisa". Só que a 0016 passou a chamá-la
-- dentro de api.vw_agente_conversa_estado — e o Postgres checa EXECUTE contra
-- quem consulta a view. Resultado: toda leitura da view dava
-- 42501 "permission denied for function fn_conversa_veio_de_anuncio", a tela
-- não conseguia ler o estado e mostrava "IA não atende esta conversa" em
-- conversas que a IA estava atendendo.
--
-- A função é leitura pura (existe mensagem com origem de anúncio nesta
-- conversa?) e o dado já é visível para `authenticated` por whatsapp_mensagens.
-- Liberar não abre nada novo.

grant execute on function core.fn_conversa_veio_de_anuncio(uuid) to authenticated;
