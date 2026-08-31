-- Achado da verificação adversarial (Onda 3, Agente F).
-- As duas funções SECURITY DEFINER de api ficaram com grant a PUBLIC
-- (proacl "=X/postgres"), herdado por anon. As outras três funções faziam
-- revoke explícito; estas duas não. Hoje não é explorável porque anon não
-- tem USAGE em api — mas um único "grant usage on schema api to anon"
-- passaria a expor input_text/output_text/custo/telefone de toda execução
-- sem autenticação. Defesa em profundidade: revogar na origem.
revoke all on function api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer) from public, anon;
revoke all on function api.fn_agente_execucao_resumo(timestamptz, timestamptz) from public, anon;

grant execute on function api.fn_agente_execucao_lista(timestamptz, timestamptz, boolean, integer) to authenticated;
grant execute on function api.fn_agente_execucao_resumo(timestamptz, timestamptz) to authenticated;
