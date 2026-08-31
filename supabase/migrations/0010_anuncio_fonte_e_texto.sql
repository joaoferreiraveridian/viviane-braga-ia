-- Dados do anúncio (clique em anúncio do Meta que abre o WhatsApp — CTWA).
--
-- No n8n esses campos NÃO eram só do CRM: iam direto no turno do usuário do
-- `AI Agent` (nó "AI Agent", promptType "define"):
--
--     Mensagem Lead: {{ ... }}
--     Dia atual: {{ $now }}
--     Hora atual: {{ $now.toFormat('HH:mm') }}
--     Fonte (se houver): {{ Edit Fields.Fonte }}
--     Texto do Anúncio (se houver): {{ Edit Fields['Texto do Anúncio'] }}
--     Origem:
--
-- ("Origem:" termina vazio no export — campo abandonado, não replicado.)
--
-- A migração para o Supabase perdeu isso junto com a tool `crm`, que ficou de
-- fora por decisão do João. Mas a parte que ia para o AGENTE não era CRM, e o
-- system prompt gravado depende dela — linha 232 do prompt literal:
--
--   "Se houver 'Fonte' e 'Texto do Anúncio', considere que o lead veio do
--    Marketing. Preciso que já identifique o texto do anúncio e já qualifique
--    o lead com base nisso. Se for de superendividamento, já inicie
--    qualificando para superendividamento. Se for revisional, já inicie
--    qualificando para revisional."
--
-- Sem estas colunas essa instrução é letra morta e o ramo de marketing nunca
-- dispara — em silêncio, que é o pior tipo de falha.
--
-- Onde guardar: na MENSAGEM, não na conversa. O WhatsApp só manda
-- `contextInfo.externalAdReply` na mensagem do clique no anúncio; nas
-- seguintes ela não vem. Guardar na conversa deixaria o dado "grudento" e
-- mudaria o comportamento — decisão do João foi fidelidade ao n8n, onde
-- `Fonte`/`Texto do Anúncio` voltam vazios já na segunda mensagem.
--
-- Assim o enqueue e o flush não mudam: a `agente-run` lê estas colunas pelas
-- mensagens de `trigger_message_ids` da própria run.

alter table public.whatsapp_mensagens
  add column if not exists fonte text,
  add column if not exists texto_anuncio text;

comment on column public.whatsapp_mensagens.fonte is
  'contextInfo.conversionSource do webhook da Uazapi — plataforma do anúncio (CTWA). Só vem na mensagem do clique.';
comment on column public.whatsapp_mensagens.texto_anuncio is
  'contextInfo.externalAdReply.body do webhook da Uazapi — texto do criativo. Só vem na mensagem do clique.';

-- Índice parcial só para as mensagens que vieram de anúncio: são poucas
-- perto do total, e a leitura da agente-run filtra por `fonte is not null`.
-- Aqui o predicado é seguro — nada faz ON CONFLICT sobre este índice (ver
-- 0009 para o caso em que isso deu 42P10).
create index if not exists whatsapp_mensagens_anuncio_idx
  on public.whatsapp_mensagens (conversa_id, ocorrido_em)
  where fonte is not null;
