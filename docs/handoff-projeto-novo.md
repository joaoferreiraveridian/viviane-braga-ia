# Handoff — migrar para o projeto Supabase novo

> **APLICADO EM 2026-08-30.** Tudo abaixo da seção "O que precisa ser refeito" já foi executado
> contra `rwuwdkurqkubiiaiuafo` com o token `sbp_` da conta nova. Resultado:
>
> | Passo | Resultado |
> |---|---|
> | extensões | `pg_cron` + `pg_net` criadas. `net.http_post` e `cron.schedule` resolvem — o `extnamespace` do `pg_net` ficar em `public` é cosmético, não precisou de `drop cascade`. |
> | migrações `0001`–`0008` | todas ok, e registradas em `supabase_migrations.schema_migrations` para uma CLI futura não reaplicar. |
> | seed | SHA no banco = `177c607f…b938`, **confere na primeira tentativa**, 18.064 bytes / 17.501 caracteres. |
> | prova da trava | só `+5521977297413` virou run (`failed`, "…nao configurados no Vault", como projetado). `+5521999990001` e `+5511988880002` ficaram no buffer, `consumido = false`. |
> | limpeza | runs 0, buffer 0, estados 0, `enabled = false`, `somente_test_phones = true`. |
> | Vault | `agente_ia_edge_url` e `agente_ia_service_role_key` gravados e lidos por `core.fn_agente_ia_secret`. |
> | deploy | as 3 `ACTIVE`; `whatsapp-webhook` com `verify_jwt = false`, as outras duas `true`. |
> | cron | `agente_ia_flush`, `10 seconds`, **`active = false`**. |
> | privilégios | `anon` = false em tudo; `authenticated` só nas duas RPC de `api` que a aba Execuções chama. |
>
> **O desvio `prompt-rest` não foi necessário.** Ele existia porque o acesso seria só o MCP, que
> obrigaria a reemitir os 18 KB inline. Com o token `sbp_`, o passo `seed` manda o texto lido do
> disco por dollar-quoting e o SHA é conferido no banco — mesma garantia, sem a função temporária
> `public.fn_gravar_system_prompt`, que **nunca chegou a ser criada** (nada a derrubar).
>
> **Falta só o que não dá para fazer por API:** expor o schema `api` em
> Project Settings → API → Exposed schemas, e cadastrar a URL do webhook na Uazapi.
> A virada (ligar o cron) segue **não autorizada**.
>
> Novidade no repo: `supabase/config.toml` (project_id + os três `verify_jwt`).
>
> **Login (30/08, depois do primeiro teste).** As duas telas abriam vazias mesmo com o schema `api`
> exposto. Causa única para as duas: o banco foi desenhado para operador LOGADO — RLS de
> `whatsapp_*` só libera `SELECT` para `authenticated`, e `api` só dá `USAGE`/`execute` para
> `authenticated` (0005) — mas o frontend não tinha login e rodava como `anon`. Conversas recebia
> `200` com `[]` (RLS esconde, não acusa) e Agentes recebia `42501`. A verificação antiga dava OK
> porque olhava `anon = false` como critério de segurança, sem notar que o app É `anon`.
> Corrigido com login de verdade (`src/lib/auth.tsx`, portão em `App.tsx`, "Sair" na topbar), sem
> afrouxar nada no banco — abrir para `anon` publicaria as conversas dos clientes, já que a anon key
> vai no bundle. Usuário `jghf5554@gmail.com` criado via Admin API com `email_confirm`.
>
> **Migrações novas:** `0009` (índice único parcial de `whatsapp_mensagens` → constraint normal; o
> `upsert` do `whatsapp-send` dava `42P10` e a resposta saía duplicada com o fallback) e `0010`
> (`fonte`/`texto_anuncio` — o turno do usuário perdera `Dia atual`/`Hora atual`/anúncio que o n8n
> mandava, deixando a linha 232 do prompt sem efeito).
>
> **Divergência deliberada do n8n:** `SPLIT_MIN_CHARS = 25` em `split-message.ts` — uma mensagem por
> sentença, colando as curtas. O n8n empilhava até 500 e mandava saudação inteira numa mensagem só.
> Pedido do João em 30/08. Checks em `split-message.test.ts`.
>
> **Ponta solta conhecida:** `message-bubble.tsx` chama a edge function `whatsapp-mensagem-acoes`
> (excluir/editar/reagir), que **não existe no repo nem está deployada** — sobra do template
> `whatsapp-inbox`. Esses três botões falham em runtime. Fora do escopo da migração; decidir se
> constrói ou some com os botões.


**Motivo.** O projeto anterior (`blllfcxvnoxoknjnayzu`) foi restringido pela plataforma: HTTP **402** em tudo que passa pela API pública, com a mensagem `exceed_storage_size_quota`. Não era o nosso código — o banco tinha 12 MB e o Storage estava vazio; quem estourou a cota foi outro projeto da mesma organização (Free, "EXCEEDING USAGE LIMITS").

O João criou uma organização e um projeto novos. **Nada de código precisa mudar.** O trabalho é reaplicar schema, seed, segredos e deploy no ref novo.

---

## Projeto novo

| | |
|---|---|
| ref | `rwuwdkurqkubiiaiuafo` |
| URL | `https://rwuwdkurqkubiiaiuafo.supabase.co` |
| anon key | já gravada em `.env` |
| service_role | **vem no prompt da nova sessão** — não está em arquivo nenhum |
| `OPENROUTER_API_KEY` | já criada como secret pelo João |

`.mcp.json` e `.env` **já apontam para o ref novo**. A nova sessão precisa reiniciar para o MCP reconectar.

---

## Acesso — o que travou a sessão de 30/08

A sessão de 30/08 **não aplicou nada no banco**: não havia credencial de escrita para o ref novo.

| Caminho | Resultado |
|---|---|
| Conector claude.ai Supabase | `You do not have permission` — a conta OAuth dele só enxerga a org da Descompliquei |
| CLI (`supabase projects list`) | logada em outra conta (org `oxmioezglydwqsncacgo`), sem esse ref |
| MCP `supabase` do `.mcp.json` | OAuth; a sessão era não-interativa e não rodava o fluxo |
| service_role | serve para a API de dados (PostgREST), **nunca** para DDL |

**Isso foi resolvido:** o João rodou `/mcp` numa sessão interativa e autorizou — *Authentication
successful. Connected to supabase.* A partir da próxima sessão o MCP `supabase` escreve no ref novo.

**O que o MCP ainda NÃO resolve, e por quê:**

1. **O seed do system prompt.** Pelo MCP o SQL vai inline na chamada da tool — ou seja, os 18 KB do
   prompt teriam que ser reemitidos pelo modelo. Foi exatamente assim que o `Ç` de `RESTRIÇÕES` virou
   `C` na primeira tentativa. Saída, sem depender de token nenhum:
   1. pelo MCP, criar a função temporária:
      ```sql
      create or replace function public.fn_gravar_system_prompt(p_prompt text)
      returns text language sql security definer
      set search_path to 'pg_catalog','core','public' as $$
        update core.agente_ia_config set system_prompt = p_prompt, atualizado_em = now()
         where canal_codigo = 'whatsapp'
         returning encode(sha256(system_prompt::bytea),'hex');
      $$;
      revoke all on function public.fn_gravar_system_prompt(text) from public, anon, authenticated;
      ```
   2. `SUPABASE_SERVICE_ROLE_KEY=... node scripts/aplicar.mjs prompt-rest` — manda o texto lido do
      arquivo pela API de dados e confere o SHA, saindo com erro se não bater;
   3. `drop function public.fn_gravar_system_prompt(text);` — **não esquecer.**
2. **O deploy das 3 edge functions.** O MCP deploya reemitindo o código inline; o caminho limpo é a
   CLI, e ela precisa de um token `sbp_` **da conta nova** (Supabase → avatar → Account → Access
   Tokens). Os tokens da skill `deploy-plataforma` são de outras contas e devolvem 403 aqui.
   Com o token: `SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy <nome> --project-ref rwuwdkurqkubiiaiuafo`.
   Se o João preferir não gerar token, o deploy pelo MCP funciona — só é mais frágil.

Com um token `sbp_` da conta nova, `scripts/aplicar.mjs` faz o handoff inteiro sozinho e o MCP vira
supérfluo. É o caminho mais curto, se ele mudar de ideia.

---

## Estado do repositório (tudo pronto, nada a reescrever)

- `src/` — as duas páginas prontas, `typecheck` e `build` limpos. `/` redireciona para `/conversas`.
- `supabase/functions/` — `whatsapp-webhook`, `whatsapp-send`, `agente-run` (+ `_shared/phone.ts`). `deno check` limpo.
- `supabase/migrations/0001` a `0008` — o schema inteiro, incluindo as correções das verificações adversariais.
  A `0008` **não existia no disco** até 30/08 à noite: este handoff a descrevia, mas o arquivo nunca
  tinha sido escrito. Foi escrita na sessão do dia 30 (`0008_test_phones_compara_so_digitos.sql`), a
  partir da `0007` mais o defeito descrito na tabela abaixo. Confirmado no código: `test_phones` nasce
  `'5521977297413'` (0002, linha 31) e o buffer guarda `+5521977297413` (`normalizePhoneE164` sempre
  devolve com `+`) — a comparação literal da `0007` dá `false` sempre. A correção normaliza os dois
  lados para dígitos; é o único ponto do banco que compara telefone com `test_phones`.
- `scripts/aplicar.mjs` — executa este handoff contra a Management API. Existe por um motivo só: o
  system prompt e as descrições das tools vão para o banco **lidos do disco**, nunca redigitados.
  Passos: `conferir | prompt-rest | extensoes | migracoes | seed | prova | limpar | vault | verificar`.
  `conferir` roda offline, sem token, e já passou (SHA bate, 18.064 bytes, `RESTRIÇÕES` intacto).
- `docs/n8n-dissecado.md` — a dissecação das 8 perguntas.
- `docs/prompt-sistema-atual.md` — o system prompt **literal**, 18.064 bytes.
  **SHA-256:** `177c607f9558d69f75d88ef53cd682ebb91732fdc7066b2e840771a4bdb4f938`
- `docs/segredos-pendentes.md` — decisões e ressalvas conhecidas.

---

## O que precisa ser refeito no projeto novo

**Ordem revisada:** extensões → migrações → seed → **prova da trava → limpeza** → Vault → deploy.
A prova mudou de lugar de propósito: rodando **antes** do Vault, `core.fn_agente_ia_secret` devolve
null, o `net.http_post` não acontece e a run do telefone de teste nasce `failed` com o aviso do Vault.
Nenhuma mensagem sai, nenhum token de LLM é gasto — e o que a prova precisa demonstrar é **quem vira
run**, não o que a run faz depois. A prova também exige `enabled = true` por alguns segundos (o flush
faz `continue` se estiver false); o script religa para `false` na mesma sequência e o passo `limpar`
confere isso.

### 1. Extensões
`pg_cron` e `pg_net`. O `pg_net` não aceita `ALTER EXTENSION ... SET SCHEMA` — se precisar movê-lo para `extensions`, é `drop extension pg_net cascade` e recriar.

### 2. Migrações `0001` a `0008`, na ordem
Aplicar por `apply_migration`, com o SQL **exatamente** como está nos arquivos. As de `0004` em diante são correções que custaram caro para achar:

| Migração | O que corrige |
|---|---|
| `0004` | `ON CONFLICT` não repetia o predicado do índice único **parcial** → `42P10` em toda chamada de `agente_ia_enqueue_message`. O webhook responderia 500 para toda mensagem. |
| `0005` | Duas funções `SECURITY DEFINER` de `api` com grant a **PUBLIC**, herdado por `anon`. |
| `0006` | Destinos do transbordo por setor (dois grupos de WhatsApp). |
| `0007` | Trava `somente_test_phones` — `enabled` é global e `test_phones` só encurta o debounce; sem a trava, lead real seria atendido no primeiro flush. |
| `0008` | `test_phones` guardado sem `+` e o buffer com `+` → a comparação nunca casava e **nem o telefone de teste era atendido**, em silêncio. Agora compara só dígitos. |

### 3. Seed
- **`core.agente_ia_config`**: o prompt literal de `docs/prompt-sistema-atual.md`. Inserir em pedaços e **conferir o SHA-256 no banco contra o do arquivo** — na primeira tentativa da sessão anterior, um blob base64 único corrompeu um caractere em silêncio (`Ç`→`C` em "RESTRIÇÕES"). Use dollar-quoting; o texto tem aspas, crases e emojis.
  - `enabled = false`, `canal_codigo = 'whatsapp'`, `provider = 'openrouter'`, `model = 'deepseek/deepseek-v4-flash-0731'`
  - `debounce_seconds = 30`, `debounce_seconds_test = 1`, `test_phones = {5521977297413}`
  - `memoria_janela_mensagens = 15`, `comando_pausar = '#pausar'`, `comando_voltar = '#voltar'`, `comando_zerar_memoria = '#zerar'`, `etiqueta_bloqueio = '5521968482967:13'`
  - `somente_test_phones = true`
  - `notificacao_destino_comercial = '120363418007788352@g.us'`
  - `notificacao_destino_administrativo = '120363422190772879@g.us'`
- **`core.agente_ia_tool`**: só `think` e `notificacao`, descrições literais (inclusive o erro `clínciasobre`). **`crm` fica de fora** — decisão do João.
  O script lê as duas descrições do próprio export (`n8n/agente-base-viviane_braga.json`), não de
  string redigitada. Detalhe conferido: no export, a de `notificacao` termina com **um espaço**
  (`"...variadas situações. "`) que a dissecação não mostra. Vai o literal do export.
- **`public.whatsapp_instancias`**: uma linha
  - `nome = 'viviane-braga'`
  - `base_url = 'https://odontonova.uazapi.com'`
  - `token = '42d79958-35b7-47a6-a229-799709da2433'`
  - `webhook_secret` = **gerar novo** (`encode(gen_random_bytes(24),'hex')`) e devolver ao João

### 4. Vault
- `agente_ia_edge_url` = `https://rwuwdkurqkubiiaiuafo.supabase.co/functions/v1`
- `agente_ia_service_role_key` = a service_role do prompt

### 5. Deploy
`whatsapp-webhook` (**`verify_jwt: false`** — autenticação própria por segredo), `whatsapp-send` e `agente-run` (ambas `verify_jwt: true`).

### 6. Lembrar o João (não dá para fazer por SQL nem MCP)
**Project Settings → API → Exposed schemas → adicionar `api`.** Sem isso as telas abrem vazias mesmo com a anon key certa.

---

## Verificação antes de entregar

`node scripts/aplicar.mjs verificar` cobre 1 a 3; `prova` e `limpar` cobrem 4.

1. SHA-256 do `system_prompt` no banco == o do arquivo.
2. `has_function_privilege('anon', ...)` = **false** em todas as funções de `core` e `api`.
   Cuidado ao ler: em `authenticated` o esperado **não** é false — a `0005` dá `grant execute` a
   `authenticated` nas duas RPC de `api` (`fn_agente_execucao_lista`, `fn_agente_execucao_resumo`),
   que são justamente as que a aba Execuções chama. Só `anon` tem que estar zerado.
3. Cron `agente_ia_flush` com `active = false`.
4. **Prova da trava**: enfileirar três telefones — o de teste e dois fictícios — rodar `core.agente_ia_flush_due_buffers()` na mão e confirmar que **só o `+5521977297413` vira run**. Limpar tudo depois e provar que limpou.
5. `npm run build` limpo. **Rodado em 30/08, exit 0** — só refazer se alguém mexer em `src/`.

---

## Regras que não mudaram

- Sem RAG, sem apontamento, sem multi-tenant, sem `organization_id`. Um prompt único em tabela.
- Redis vetado — debounce em Postgres puro, `FOR UPDATE SKIP LOCKED` com recheca sob o lock.
- Nada externo além do WhatsApp (Uazapi) e do LLM (OpenRouter).
- Português com acentuação correta em banco e tela. Zero controle nativo do navegador.
- **Cron pausado e `enabled = false` até o João aprovar.** A virada — ligar o cron e desligar o n8n na mesma janela — só com autorização explícita dele.

---

## Depois de tudo pronto

Devolver ao João a URL nova do webhook, para ele trocar na Uazapi:

```
https://rwuwdkurqkubiiaiuafo.supabase.co/functions/v1/whatsapp-webhook?instancia=viviane-braga&secret=<webhook_secret novo>
```

Configuração da Uazapi já validada: Escutar eventos = só `messages`; Excluir = `isGroupYes` **e** `wasSentByApi`; `addUrlEvents` e `addUrlTypesMessages` **desligados**; salvar em "Salvar", nunca "Salvar com um novo".

## Pendências que continuam abertas

- Sub-workflow n8n `notificacao_viviane` (`juJ3Ew61xCdAzGnf`) nunca veio no export — os dois grupos vieram do João, não do n8n.
- O token da Uazapi está em texto puro no export e já circulou; vale trocar.
- Avisar quem opera hoje: o comando de pausa deixou de ser `Oi!` e passou a ser `#pausar`.
- O `webhook_secret` novo **só existe depois do seed** (`gen_random_bytes(24)`), então a URL para
  cadastrar na Uazapi ainda não foi gerada. Ela sai no passo `seed`.

---

## Prompt para a próxima sessão

Cole isto na sessão nova (o MCP `supabase` já está autorizado; a service_role continua fora de
arquivo, por isso vem colada no prompt):

> Continuação da migração da Viviane Braga. Leia `docs/handoff-projeto-novo.md` primeiro — está
> atualizado e tem o contexto, a ordem de execução e o que já foi feito.
>
> Resumo: código, migrações `0001`–`0008`, edge functions e as duas telas estão prontos e conferidos
> no repositório; `npm run build` passou. A sessão anterior não aplicou nada no banco porque não
> tinha credencial de escrita para o ref novo. Isso foi resolvido: o MCP `supabase` está autorizado.
>
> Projeto: `rwuwdkurqkubiiaiuafo`. Service role (grave no Vault como `agente_ia_service_role_key` e
> não repita em arquivo nenhum): `<colar a service_role aqui>`
>
> Execute na ordem da seção "O que precisa ser refeito no projeto novo": extensões, migrações `0001`
> a `0008` exatamente como estão nos arquivos, seed, prova da trava, limpeza, Vault, deploy das 3
> functions.
>
> Dois cuidados que já custaram caro, detalhados no handoff:
>
> 1. O system prompt vai para o banco **literal, byte a byte**, e o MCP não serve para isso — use o
>    caminho da seção "Acesso": função temporária `public.fn_gravar_system_prompt`,
>    `node scripts/aplicar.mjs prompt-rest`, e derrubar a função depois. O SHA-256 no banco tem que
>    dar `177c607f9558d69f75d88ef53cd682ebb91732fdc7066b2e840771a4bdb4f938`. Uma tentativa anterior
>    corrompeu um caractere em silêncio.
> 2. As migrações `0004` a `0008` são correções de bugs reais achados em verificação adversarial.
>    Não "simplifique" nenhuma delas.
>
> Inegociável: cron nasce pausado, `agente_ia_config.enabled = false` e a trava
> `somente_test_phones = true`. **NÃO faça a virada (ligar o cron) sem me perguntar.**
> Escopo enxuto: um prompt único em tabela, sem RAG, sem apontamento, sem multi-tenant, Redis vetado,
> nada externo além do WhatsApp e do LLM.
>
> Para o deploy das edge functions: se eu não te passar um token `sbp_` da conta nova, deploya pelo
> MCP mesmo e me avisa.
>
> Ao final: rode a prova da trava com três telefones (só o `5521977297413` pode virar run), limpe o
> que criar, e me devolva a URL nova do webhook com o `webhook_secret` novo para eu cadastrar na
> Uazapi. E me lembre de expor o schema `api` no painel — isso eu tenho que fazer na mão.
