-- Correção: o índice único agente_ia_buffer_msg_uk é PARCIAL
--   (pessoa_id, message_id) WHERE message_id IS NOT NULL
-- O Postgres exige que a cláusula ON CONFLICT repita o predicado do índice
-- parcial para conseguir mirar nele. Sem o WHERE, o planejador não encontra
-- índice compatível e toda chamada falha com 42P10 — inclusive quando
-- message_id é null, porque a checagem é em tempo de planejamento, não
-- depende do valor. Efeito prático antes do fix: o whatsapp-webhook
-- respondia 500 para toda mensagem recebida.
create or replace function core.agente_ia_enqueue_message(
  p_pessoa_id uuid,
  p_telefone_e164 text,
  p_conteudo text,
  p_message_id text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'core'
as $function$
begin
  insert into core.agente_ia_estado (pessoa_id) values (p_pessoa_id)
  on conflict (pessoa_id) do nothing;

  insert into core.agente_ia_mensagem_buffer (pessoa_id, telefone_e164, content, message_id)
  values (p_pessoa_id, p_telefone_e164, p_conteudo, p_message_id)
  on conflict (pessoa_id, message_id) where message_id is not null do nothing;
end;
$function$;

revoke execute on function core.agente_ia_enqueue_message(uuid, text, text, text) from anon, authenticated;
