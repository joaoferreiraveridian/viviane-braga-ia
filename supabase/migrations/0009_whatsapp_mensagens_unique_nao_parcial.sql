-- Mesmo defeito da 0004, em outro lugar — e este só aparece em produção.
--
-- `whatsapp_mensagens_conversa_id_externo_key` era um índice único PARCIAL:
--
--     UNIQUE (conversa_id, id_externo) WHERE (id_externo IS NOT NULL)
--
-- A `whatsapp-send` grava por PostgREST com
-- `upsert(..., { onConflict: 'conversa_id,id_externo' })`, que gera
-- `ON CONFLICT (conversa_id, id_externo)` **sem** o predicado — PostgREST não
-- tem como emiti-lo. O Postgres então não casa com o índice parcial e devolve
-- 42P10 ("there is no unique or exclusion constraint matching the ON CONFLICT
-- specification").
--
-- O efeito era traiçoeiro: a mensagem SAÍA no WhatsApp (a Uazapi é chamada
-- antes do insert) e só depois o registro falhava; a função devolvia 500, a
-- `agente-run` contava como falha de envio e mandava o texto de fallback
-- ("tive um problema técnico agora para responder"). O cliente recebia a
-- resposta boa E o pedido de desculpas, um atrás do outro.
--
-- A 0004 corrigiu o caso irmão (`agente_ia_enqueue_message`) repetindo o
-- predicado no ON CONFLICT. Aqui isso não é possível, então a correção é do
-- outro lado: tirar o predicado do índice.
--
-- Trocar o índice parcial por uma constraint única normal NÃO afrouxa nada:
-- num índice único, NULL é distinto de qualquer coisa, inclusive de outro
-- NULL, então várias linhas com `id_externo IS NULL` continuam permitidas —
-- que era a única razão de o predicado existir. Para as linhas com
-- `id_externo` preenchido a garantia é idêntica.

alter table public.whatsapp_mensagens
  drop constraint if exists whatsapp_mensagens_conversa_id_externo_key;

drop index if exists public.whatsapp_mensagens_conversa_id_externo_key;

alter table public.whatsapp_mensagens
  add constraint whatsapp_mensagens_conversa_id_externo_key
  unique (conversa_id, id_externo);
