-- O transbordo do n8n (sub-workflow notificacao_viviane) mandava para dois
-- destinos diferentes conforme o setor. O usuário confirmou que são dois
-- GRUPOS de WhatsApp (JID @g.us), não telefones — por isso o valor nunca
-- pode passar pela normalização E.164 de _shared/phone.ts.
--
-- Ficam em config, e não em secret da function, porque um JID de grupo não é
-- segredo: assim fica auditável, visível na aba Configuração e alterável sem
-- redeploy da function.
alter table core.agente_ia_config
  add column if not exists notificacao_destino_comercial text,
  add column if not exists notificacao_destino_administrativo text;

comment on column core.agente_ia_config.notificacao_destino_comercial is
  'Destino do transbordo Comercial (leads novos). Aceita JID de grupo (@g.us) ou telefone E.164.';
comment on column core.agente_ia_config.notificacao_destino_administrativo is
  'Destino do transbordo Administrativo (clientes antigos). Aceita JID de grupo (@g.us) ou telefone E.164.';

update core.agente_ia_config
   set notificacao_destino_comercial      = '120363418007788352@g.us',
       notificacao_destino_administrativo = '120363422190772879@g.us';
