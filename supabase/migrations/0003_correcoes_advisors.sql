-- Correcoes apontadas pelo advisor de seguranca depois de aplicar 0001/0002.
-- Nenhuma mudanca de comportamento -- so fecha buracos de search_path mutavel
-- e execucao publica desnecessaria numa funcao SECURITY DEFINER, e tira o
-- pg_net do schema public (recomendacao padrao do linter do Supabase).

-- pg_net nao suporta ALTER EXTENSION ... SET SCHEMA (extensao nao realocavel).
-- Reinstala no schema extensions, como o linter do Supabase recomenda.
-- Seguro: cron job agente_ia_flush nasce pausado, nada chama net.http_post
-- entre o drop e o create.
drop extension pg_net cascade;
create extension pg_net schema extensions;

create or replace function public.whatsapp_atualizar_conversa()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
begin
  update whatsapp_conversas
  set ultima_mensagem_conteudo = coalesce(new.conteudo, '[' || new.tipo_conteudo || ']'),
      ultima_mensagem_em = new.ocorrido_em,
      atualizado_em = now(),
      nao_lidas = case when new.direcao = 'entrada' then nao_lidas + 1 else nao_lidas end
  where id = new.conversa_id;
  return new;
end;
$$;
-- Trigger nao precisa de EXECUTE via RPC -- so o proprio disparo do gatilho
-- a invoca. Revoga para nao aparecer como SECURITY DEFINER chamavel por anon.
revoke all on function public.whatsapp_atualizar_conversa() from public, anon, authenticated;
