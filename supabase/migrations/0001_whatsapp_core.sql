-- Schema base de WhatsApp via Uazapi (skill whatsapp-uazapi). Escopo enxuto:
-- so as 3 tabelas de instancia/conversa/mensagem + trigger de preview + realtime.
-- Sem camada avancada (responder/reagir/editar/excluir/figurinha) -- nao pedida
-- neste projeto; aplicar por cima depois, se um dia for preciso.

create table whatsapp_instancias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                          -- identificador curto, ex: "viviane-braga"
  telefone text,                                -- preenchido depois de conectar
  base_url text not null,                       -- ex: https://odontonova.uazapi.com
  token text,                                   -- token de instancia retornado pela Uazapi
  status text not null default 'desconectado' check (
    status in ('desconectado', 'aguardando_qrcode', 'conectado', 'erro')
  ),
  qrcode_base64 text,                           -- ultimo QR gerado, null depois de conectar
  webhook_secret text not null,                 -- segredo proprio, gerado no momento da criacao
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index whatsapp_instancias_nome_key on whatsapp_instancias (nome);

create table whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  instancia_id uuid not null references whatsapp_instancias(id) on delete cascade,
  contato_telefone text not null,               -- E.164, ex: +5521999999999
  contato_nome text,
  ultima_mensagem_conteudo text,
  ultima_mensagem_em timestamptz,
  nao_lidas integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index whatsapp_conversas_instancia_telefone_key
  on whatsapp_conversas (instancia_id, contato_telefone);
create index whatsapp_conversas_atualizado_em_idx
  on whatsapp_conversas (atualizado_em desc);

create table whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references whatsapp_conversas(id) on delete cascade,
  direcao text not null check (direcao in ('entrada', 'saida')),
  remetente text not null check (remetente in ('contato', 'agente', 'bot')),
  tipo_conteudo text not null default 'texto' check (
    tipo_conteudo in ('texto', 'imagem', 'video', 'audio', 'documento')
  ),
  conteudo text,
  media_path text,
  id_externo text,                              -- id da Uazapi, ou id_externo do client (idempotencia)
  status_entrega text default 'enviado',         -- enviado | entregue | lido | falhou
  ocorrido_em timestamptz not null default now()
);
create unique index whatsapp_mensagens_conversa_id_externo_key
  on whatsapp_mensagens (conversa_id, id_externo) where id_externo is not null;
create index whatsapp_mensagens_conversa_ocorrido_idx
  on whatsapp_mensagens (conversa_id, ocorrido_em);

-- Mantem ultima_mensagem_* de whatsapp_conversas em dia sem o frontend
-- precisar fazer dois writes.
create or replace function whatsapp_atualizar_conversa()
returns trigger as $$
begin
  update whatsapp_conversas
  set ultima_mensagem_conteudo = coalesce(new.conteudo, '[' || new.tipo_conteudo || ']'),
      ultima_mensagem_em = new.ocorrido_em,
      atualizado_em = now(),
      nao_lidas = case when new.direcao = 'entrada' then nao_lidas + 1 else nao_lidas end
  where id = new.conversa_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger whatsapp_mensagens_atualizar_conversa
  after insert on whatsapp_mensagens
  for each row execute function whatsapp_atualizar_conversa();

alter table whatsapp_instancias enable row level security;
alter table whatsapp_conversas enable row level security;
alter table whatsapp_mensagens enable row level security;

-- Leitura para usuario autenticado (tela); escrita so por service_role
-- (edge functions) -- de proposito, sem policy de insert/update aqui.
create policy "leitura autenticada" on whatsapp_instancias for select to authenticated using (true);
create policy "leitura autenticada" on whatsapp_conversas for select to authenticated using (true);
create policy "leitura autenticada" on whatsapp_mensagens for select to authenticated using (true);

alter publication supabase_realtime add table whatsapp_conversas;
alter publication supabase_realtime add table whatsapp_mensagens;
