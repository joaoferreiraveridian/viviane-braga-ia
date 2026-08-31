# Segredos e credenciais pendentes

> **Atualizado.** Os itens 1 a 5 foram resolvidos pelo João. O que sobra está na seção "Ainda aberto", no fim. O histórico abaixo fica como registro do que foi decidido e por quê.

Nada aqui foi preenchido por mim. Cada linha depende de uma decisão ou de um valor que só o João tem. O sistema **não roda de verdade** enquanto os itens marcados 🔴 estiverem abertos — mas as duas telas abrem e o build passa mesmo assim, de propósito.

Lista consolidada ao final da Onda 3. Se um agente descobriu um segredo adicional, ele aparece aqui.

---

## 🔴 Bloqueia o agente de responder

### 1. `OPENROUTER_API_KEY` — secret da edge function `agente-run`
O agente usa `deepseek/deepseek-v4-flash-0731` via OpenRouter (nó `OpenRouter Chat Model`, credencial n8n `openRouterApi :: Viviane Braga`). A chave está guardada no n8n, não no export.

```
supabase secrets set OPENROUTER_API_KEY=sk-or-... --project-ref blllfcxvnoxoknjnayzu
```

### 2. Token da instância Uazapi — Vault / secret da function de envio
O export tem **dois** tokens diferentes para o mesmo host `odontonova.uazapi.com`:

| Token | Nó | Para quê |
|---|---|---|
| `42d79958-35b7-47a6-a229-799709da2433` | `envia_texto` | resposta ao lead — **provavelmente é este** |
| `434baaaf-4906-47f1-b0cf-1389a93e06e0` | `envia_texto1` | alerta de erro para `5521977297413` — outra instância |

**Confirmar qual é o da instância da Viviane Braga** antes de gravar. Os dois estão em texto puro no JSON do export — considere-os vazados e troque na Uazapi.

### 3. `SUPABASE_ACCESS_TOKEN` — para o deploy das edge functions pela CLI
Só necessário se o deploy for pela CLI em vez do MCP.

---

## 🔴 Bloqueia a tela de abrir com dado

### 4. `VITE_SUPABASE_ANON_KEY` no `.env`
A chave publicável (anon) do projeto `blllfcxvnoxoknjnayzu`. `VITE_SUPABASE_URL` já está preenchida. Sem a anon key as telas abrem em estado vazio, sem erro — mas não mostram nada.

Pegue em Supabase → Project Settings → API Keys → publishable/anon. **Nunca a service role key no frontend.**

---

### 4b. Expor o schema `api` no PostgREST
Painel do Supabase → Project Settings → API → **Exposed schemas** → adicionar `api`.

Sem isso o PostgREST não enxerga as views e RPC que alimentam as duas telas, e elas abrem vazias mesmo com a anon key correta. É configuração de projeto, não SQL — não existe tool de MCP nem migração que faça isso.

---

## 🟡 Bloqueia o transbordo (tool `notificacao`)

### 5. Para quem a notificação vai
O sub-workflow n8n `notificacao_viviane` (id `juJ3Ew61xCdAzGnf`) **não veio no export** — só a referência por id. Não dá para saber daqui:

- quais números recebem a notificação do **Administrativo**;
- quais recebem a do **Comercial**;
- se ele fazia mais alguma coisa além de mandar WhatsApp.

O único número que aparece no export é `5521977297413`, e ele é destino de **alerta de erro técnico**, não de transbordo comercial — e é também o telefone de teste do debounce. Não assumi que fosse o destino.

**Preciso**: exportar `notificacao_viviane` do n8n, ou você me dizer os números.

### 5b. `NOTIFICACAO_TELEFONES_DESTINO` — 🔴 novo, identificado pelo Agente B na Onda 1
Lista de telefones em E.164 separados por vírgula, destino real do transbordo disparado pela tool `notificacao`. Consequência direta do item 5: como o sub-workflow `notificacao_viviane` não veio no export, ninguém sabe os números — nem se Administrativo e Comercial usam listas diferentes. A edge function `agente-run` precisa desse valor (secret da function ou linha de configuração) antes de a tool `notificacao` poder enviar qualquer coisa de verdade.

**Preciso**: você me passar os números (ou confirmar se Administrativo/Comercial compartilham a mesma lista).

---

## 🟡 Bloqueia a virada

### 6. Vault: `agente_ia_edge_url` e `agente_ia_service_role_key`
`agente_ia_edge_url` **✅ gravado por mim na Onda 2** — `https://blllfcxvnoxoknjnayzu.supabase.co/functions/v1` (a função `agente_ia_flush_due_buffers()` concatena `/agente-run`). Não depende de você, é só a URL do próprio projeto.

`agente_ia_service_role_key` **🔴 continua pendente** — não gravei nenhum valor, nem vazio: é a chave do seu projeto, inventar um placeholder no Vault criaria uma falsa sensação de "configurado". Sem ela, `core.fn_agente_ia_secret('agente_ia_service_role_key')` retorna `null` e `agente_ia_flush_due_buffers()` marca a run como `failed` com esse motivo — comportamento seguro, não silencioso. Confirme que posso ler do projeto e me passe o valor (ou grave você mesmo via `vault.create_secret`).

### 7. Desligar o workflow do n8n no mesmo instante
Não é segredo, é procedimento: enquanto o n8n e o Supabase estiverem ligados ao mesmo tempo, **o mesmo lead recebe resposta em dobro**. A virada é: `cron.alter_job(..., active := true)` **e** desligar `agente-base-viviane_braga` no n8n, na mesma janela.

O cron nasce pausado e `agente_ia_config.enabled = false`. **Não ligo nada sem você mandar.**

---

## Ainda aberto

### A. ~~`agente_ia_service_role_key` no Vault~~ ✅ resolvido
Gravada e verificada: `core.fn_agente_ia_secret('agente_ia_service_role_key')` devolve os 219 caracteres. JWT confere — `role: service_role`, `ref: blllfcxvnoxoknjnayzu`, válida até 2036-08-30.

Testado ponta a ponta contra a `agente-run`: sem a chave, **401**; com a chave, a função autentica, sobe, conecta no Postgres e consulta `core.agente_ia_run`. A perna de autenticação do cron está provada.

### B. Cadastrar o webhook na Uazapi
URL nova (o n8n sai de cena):

```
https://blllfcxvnoxoknjnayzu.supabase.co/functions/v1/whatsapp-webhook?instancia=viviane-braga
```

Header: `x-webhook-secret: 9eb27664ad70f9c686b5c1c0f8f24ca0057e44ea1732c079`

Se a Uazapi não permitir header customizado, dá para mandar como query string (`&secret=…`) — a function aceita os dois.

### C. Trocar o token da Uazapi
`42d79958-35b7-47a6-a229-799709da2433` está em texto puro no export do n8n e foi colado no chat. Está gravado e funcionando; troque quando puder e me avise para atualizar `whatsapp_instancias`.

### D. Avisar quem opera hoje
O comando de pausa deixou de ser `Oi!` e passou a ser `#pausar`. Voltar é `#voltar`.

---

## Ressalvas da verificação adversarial (Onda 3) — não são segredos, são dívida conhecida

Os **reprovados** foram corrigidos (migração `0005`, reserva atômica da run em `agente-run`, contrato de payload do `whatsapp-send`). Estes quatro ficaram registrados de propósito:

1. **`agente_ia_flush_due_buffers` sem advisory lock e sem isolamento por grupo.** O laço roda numa transação só: um erro em uma conversa desfaz o tick inteiro (reprocessa no tick seguinte, não duplica). E um overlap de cron poderia, em teoria, gerar duas runs para o mesmo lead. Fix quando incomodar: `pg_try_advisory_xact_lock` no início da função.
2. **Run que fica em `pending` para sempre.** Se o `net.http_post` nunca responder, ninguém detecta. Não é duplicidade — é ausência de retry e de observabilidade.
3. **`use-acoes-mensagem.ts` chama `whatsapp-mensagem-acoes`, que não existe.** Hoje é código morto: os botões de responder/reagir/editar/excluir só renderizam se `id_provedor` e `owner_provedor` estiverem preenchidos, e nenhuma das functions grava essas colunas. **Se um dia alguém passar a gravá-las, os botões aparecem e chamam um 404.** Ou apaga o hook agora, ou lê este parágrafo antes de mexer nisso.
4. **Citação de mensagem não é transmitida.** `respostaAId` só alimenta a bolha otimista; o `whatsapp-send` não suporta. Consequência do item 3 — a UI de responder nunca renderiza mesmo.

---

## Decisões já tomadas por você (registro)

| Pergunta | Resposta |
|---|---|
| Cor de acento | Índigo Executivo (`234 56% 60%`) |
| Tool `crm` | Fica de fora. Prompt permanece literal, com a nota de que a tool não é oferecida. |
| `notificacao` pausa a IA? | **Sim, pausa automaticamente.** Muda o comportamento do n8n de propósito, para o agente não responder por cima do atendente. |

## Decisões ainda abertas

| Pergunta | Recomendação |
|---|---|
| `select count(*) from memoria_agente_viviane` — migrar histórico? | Só se estiver populada. Nice-to-have. |
| Comando de pausa vira `#pausar`/`#voltar` (era `Oi!`/`!voltar`) | Avisar quem opera hoje. `Oi!` silenciava o número para sempre — não replicar. |
| Tokens Uazapi vazados no export | Trocar na Uazapi. |
