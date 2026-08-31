# Dissecação do export n8n — `agente-base-viviane_braga`

Fonte: `n8n/agente-base-viviane_braga.json` — 153 nós, `active: false`, `executionOrder: v1`.
Webhook: `POST /webhook/viviane-braga` (produção: `https://webhook.orbevision.shop/webhook/viviane-braga`).

Tudo abaixo cita o nó de origem. O que não está no export não está aqui.

---

## 1. Qual é o system prompt, literal?

Origem: nó **`AI Agent`** (`@n8n/n8n-nodes-langchain.agent`), campo `parameters.options.systemMessage` — 17.510 caracteres.

Cópia byte a byte em [prompt-sistema-atual.md](prompt-sistema-atual.md) e reproduzida integralmente na seção **Anexo A** deste documento. Não foi resumido, reescrito nem corrigido — inclusive os erros de digitação (`mensagennns`, `nenhumma`, `clínciasobre`, `despense` por "dispense") permanecem, porque são o prompt que está em produção hoje.

O prefixo `=` da primeira linha é o marcador de expressão do n8n, não faz parte do texto. O conteúdo começa em `---`.

**Variáveis interpoladas dentro do system prompt** (3, todas na seção 7 — CRM):

| Variável | De onde vinha no n8n |
|---|---|
| `{{ telefone_sem_formatacao }}` | Nunca resolvida. Não existe nó que produza esse nome; o n8n entrega o literal `{{ telefone_sem_formatacao }}` ao modelo. |
| `{{ nome_whatsapp }}` | Idem — literal. O nome real está em `Edit Fields.Nome` (`body.chat.name`). |
| `{{ telefone }}` | Idem — literal. O telefone real está em `Edit Fields['Número de celular']` (`body.chat.wa_chatid`). |

> São chaves de `systemMessage` que o n8n **não** interpola (só interpola o campo `text`). O modelo recebe as chaves cruas. Na migração isso vira substituição real — ganho de qualidade, não regressão.

**Prompt do usuário** — nó `AI Agent`, campo `parameters.text`, esse sim interpolado:

```
Mensagem Lead: {{ $('Edit Fields4').first().json.mensagens }}

Dia atual: {{ $now }}
Hora atual: {{ $now.toFormat('HH:mm') }}
Fonte (se houver): {{ $('Edit Fields').first().json.Fonte }}
Texto do Anúncio (se houver): {{ $('Edit Fields').first().json['Texto do Anúncio'] }}
Origem: 
```

`Origem:` termina vazio no export — campo abandonado. `Fonte` e `Texto do Anúncio` vêm de `body.message.content.contextInfo.conversionSource` e `.externalAdReply.body` (clique em anúncio do Meta).

**Segundo prompt, de sistema também** — nó `Parser Chain` (divisor de mensagens). **Está morto**: `Parser Chain` não tem nenhuma conexão `main` de entrada e sua saída (`Split Out1`) não vai a lugar nenhum. Foi substituído pelo nó `Code in JavaScript4`. Registrado na pergunta 2 por completude; não migrar o LLM, migrar o código.

---

## 2. Quais são as tools, e o que cada uma realmente faz?

**Ligadas de verdade ao agente** (conexão `ai_tool` → `AI Agent`): apenas **duas**.

### `think` — nó `think` (`toolThink`)
Sem parâmetros além da descrição. É o "think tool" nativo: o modelo escreve o raciocínio e recebe de volta. Sem efeito colateral.

Descrição literal:
> Use esta ferramenta para organizar seus pensamentos antes de cada resposta. Analise o contexto da conversa, identifique qual etapa do atendimento a cliente está, verifique quais informações já foram coletadas e determine a melhor abordagem para responder de forma natural e eficiente.

### `notificacao` — nó `notificacao` (`toolWorkflow` → sub-workflow `notificacao_viviane`, id `juJ3Ew61xCdAzGnf`)
Descrição literal: `Chame essa tool para notificar a clínciasobre variadas situações.` (sic).

Parâmetros — 3 vêm do modelo (`$fromAI`), 1 é injetado pelo n8n:

| Campo | Origem | Descrição dada ao modelo |
|---|---|---|
| `Resumo` | `$fromAI` | "Resumo da conversa, seja para qualificação, seja para contexto geral." |
| `Nome` | `$fromAI` | "Nome do lead, se informado." |
| `Administrativo_Comercial` | `$fromAI` | "Se é uma notificação para o Administrativo ou para o Comercial." |
| `WhatsApp` | injetado | `Edit Fields['Número de celular'].split('@')[0].substring(2)` — telefone sem `@s.whatsapp.net` e **sem o DDI 55**. |

**Efeito colateral: desconhecido.** O corpo do sub-workflow `notificacao_viviane` **não está neste export** — só a referência por id. Pelo system prompt (seções 2 e 6) ele envia um WhatsApp para a equipe (Administrativo ou Comercial) com o resumo. Se ele também desliga a IA, não dá para saber daqui. → **Pendência para o João**: exportar `notificacao_viviane` ou confirmar o comportamento.

### `crm` — nó `crm` (`toolWorkflow` → sub-workflow `crm-novo-viviane`, id `UfVxq9twedigIIKdp4Iky`)

**⚠️ A tool `crm` NÃO está conectada ao agente.** O nó existe no canvas, mas não há aresta `ai_tool` dele para o `AI Agent` (as únicas são `think` e `notificacao`). Enquanto isso, o system prompt dedica a seção 7 inteira a ela e diz *"essa tool SEMPRE deve ser chamada para QUALQUER que seja a solicitação"* e *"Você será penalizado se não enviar o resumo"*.

Ou seja, hoje em produção **o modelo é instruído a chamar uma ferramenta que não existe** no seu toolset. Ele nunca a chama; o `resumo_atendimento` nunca é gravado por essa via. Isso não é migração, é um defeito a decidir.

Parâmetros que o nó declara (caso se decida ligá-la):

| Campo | Origem |
|---|---|
| `Resumo` | `$fromAI` (sem descrição — string livre; o formato real está codificado nos 12 templates da seção 7 do prompt) |
| `WhatsApp` | injetado: `Número de celular` sem `@s.whatsapp.net` e sem `55` |
| `Push Name` | injetado: `Webhook.body.chat.name` |

**Camada perdida:** aqui é o caso clássico. O `Resumo` é uma string em prosa (`PRIMEIRO_CONTATO - Buscar cliente pelo telefone ... Pipeline: 'Novo Lead'`) que o sub-workflow `crm-novo-viviane` provavelmente reparseia com um LLM próprio para decidir insert/update e pipeline. Esse sub-workflow **também não está no export**.

**Decisão recomendada para o escopo desta migração:** migrar `think` e `notificacao`. A `crm` fica **fora** — ela está desligada hoje, o corpo dela não existe no export, e o CRM/pipeline não faz parte do escopo enxuto acordado. O trecho do prompt que a descreve é mantido literal (é o prompt em produção), mas com a nota de que a tool não é oferecida. → **Decisão do João**, registrada na seção "Pendências".

### Chamadas de LLM fora do agente

| Nó | O que faz |
|---|---|
| `OpenAI` (`openAi`, resource `audio`, operation `transcribe`, `language: pt`) | Transcreve áudio recebido. Whisper. |
| `Analyze image1` (`openAi`, resource `image`, `gpt-4.1-mini`) | Analisa imagem com o prompt: *"Você é um analisador de imagens especializado em identificar contracheques. (…) O seu objetivo é passar para uma IA principal que o contracheque do cliente foi recebido. Não deve fazer análises profundas do conteúdo."* Recebe a legenda da imagem em `Infos Manuais.mensagem`. |
| `Extract from File` | Extrai texto de PDF. Sem LLM. |

Os três desembocam em `contatena_mensagem1` → o texto resultante entra no buffer como se fosse mensagem de texto do lead. **São pré-processadores de mídia, não tools do agente.**

---

## 3. Como era o debounce/buffer?

Redis, exatamente o padrão VR Concept, com um caminho separado para o número de teste.

Ordem dos nós: `contatena_mensagem1` → `Redis1` → `If10` → (`Wait2`|`Wait1`) → (`Redis`|`Redis2`) → (`If11`|`If1`) → `Edit Fields4` → `Redis3`.

| Passo | Nó | Detalhe |
|---|---|---|
| Enfileira | `Redis1` | `RPUSH` (`tail: true`) na LIST cuja chave é `Edit Fields['Número de celular']` — **o wa_chatid inteiro, com `@s.whatsapp.net`**. Valor: `UserMessage`. |
| Bifurca | `If10` | `Número de celular == '5521977297413@s.whatsapp.net'` → ramo de teste. |
| Espera | `Wait2` (teste) / `Wait1` (produção) | **1 segundo** para o telefone de teste, **30 segundos** para todos os demais. |
| Relê | `Redis` / `Redis2` | `GET` da mesma LIST → `mensagens` (array). |
| Compara | `If11` / `If1` | `mensagens.last() == UserMessage` da própria execução. **Igual** → segue. **Diferente** → `No Operation` (execução descartada: outra mensagem chegou durante a espera e aquela execução é que vai responder). |
| Concatena | `Edit Fields4` | `mensagens.join('\n')` → campo `mensagens`; e `whatsapp` = número de celular. |
| Limpa | `Redis3` | `DEL` da chave, logo antes de chamar o agente. |

Notas para a migração:
- Espera de produção é **30s** (não 45s como na VR Concept). O template usa `debounce_seconds`; setar **30**, e **1** para o telefone de teste.
- A chave de agrupamento é o `wa_chatid` completo. No Supabase a chave é o telefone normalizado — equivalente, 1:1 por conversa.
- `Redis3` apaga o buffer **antes** da chamada ao LLM. Se o agente falhar, as mensagens já foram perdidas. O template Postgres marca o buffer como consumido dentro da transação da run — comportamento melhor, mantido de propósito.

---

## 4. Qual é a memória do agente, de verdade?

Nó **`Postgres Chat Memory`** (`memoryPostgresChat`), conectado por `ai_memory` ao `AI Agent`:

- `tableName`: **`memoria_agente_viviane`**
- `sessionKey`: `Número de celular.split('@')[0]` → telefone **com DDI 55**, sem sufixo
- `contextWindowLength`: **15**

Aqui, ao contrário do caso VR Concept descrito na referência, a memória **é** a tabela `memoria_agente_*` e ela **está ligada de verdade** — é o único `ai_memory` do agente. Janela de 15 mensagens.

Há um segundo nó, `Postgres Chat Memory1` (`contextWindowLength: 200`), ligado ao `Chat Memory Manager` (`mode: delete`, `deleteMode: all`) — usado só pelo comando `#zerar` (ver pergunta 7).

A tabela `mensagens` do Supabase (`cria_mensagem`, `Create a row`) é o **log de conversa da tela**, não a memória do agente: grava entrada do lead e saída do bot, mas nunca é lida de volta como contexto.

→ **Pendência para o João**: rodar `select count(*) from memoria_agente_viviane;` no Postgres do n8n. Se estiver populada, migrar as N últimas por telefone é opcional (nice-to-have); se estiver vazia, a memória nasce do zero e as primeiras conversas perdem histórico.

Na migração, a memória passa a ser a janela das últimas 15 mensagens de `whatsapp_mensagens` da própria conversa — mesma semântica, uma tabela a menos.

---

## 5. Existe RAG?

**Não.** Zero nós de vector store, zero embeddings, zero tabela `documents` no export.

O que o prompt chama de "Contexto RAG" (seção 6, e o checklist do `think`: *"Tenho a informação no RAG ou preciso perguntar?"*) é **texto estático escrito dentro do próprio system prompt** — a história do escritório, os 2 produtos, o horário, as FAQs. É prompt, não recuperação.

Fora do escopo. Nada a construir.

---

## 6. Qual LLM, qual modelo, qual provedor?

**Agente principal** — nó `OpenRouter Chat Model` (`lmChatOpenRouter`, credencial `openRouterApi :: Viviane Braga`), único ligado por `ai_languageModel` ao `AI Agent`:

```
deepseek/deepseek-v4-flash-0731
```

Sem `options` — temperatura, maxTokens, tudo no default do OpenRouter.

Modelos presentes no canvas mas **não ligados ao agente** (não migrar, registrar):

| Nó | Modelo | Ligado a |
|---|---|---|
| `OpenAI4` | `gpt-4.1-mini` | `Parser Chain` — que está morto |
| `OpenAI Chat Model` | `gpt-5.6-luna` | nada |
| `xAI Grok Chat Model` | `grok-4-fast-reasoning` | nada |
| `Analyze image1` | `gpt-4.1-mini` | análise de imagem (fora do agente) |
| `OpenAI` | Whisper | transcrição de áudio (fora do agente) |

Na virada: **manter `deepseek/deepseek-v4-flash-0731` via OpenRouter**. Trocar modelo no mesmo dia da troca de arquitetura torna impossível saber o que causou qualquer mudança de comportamento.

---

## 7. Quem liga e desliga a IA, e quando?

Tudo por chaves Redis por telefone (base: `Número de celular.split('@')[0]`, com DDI). Dois bloqueios independentes:

### Bloqueio temporário — `{telefone}_bloqueioTemporario`
- **Escrito** por `Bloqueio Temporario1` (`SET ... = 'true'`), no ramo `MENSAGEM` do `Switch2` — ou seja, **toda mensagem normal do lead grava esse bloqueio**.
- **Lido** por `Verificar bloqueio temporario1`.
- Sem TTL no nó. Bloqueia a partir da primeira mensagem e não é limpo por nenhum nó do export.

### Bloqueio permanente — `{telefone}_bloqueioPermanente`
- **Ligado** por `Block Permanente1` (`SET ... = 'true'`) — ramo `PAUSAR` do `Switch2`.
- **Desligado** por `Desbloquear Agente1` (`DEL`) — ramo `VOLTAR` do `Switch2`.
- **Lido** por `Verificar bloqueio permamente1`.

### O `Switch2` — os comandos de operação (sobre a mensagem crua do lead)

| Saída | Condição — `Edit Fields.Mensagem` igual a | Ação |
|---|---|---|
| `PAUSAR` | `Oi!` (exato, case-sensitive) | liga bloqueio permanente |
| `VOLTAR` | `!voltar` | desliga bloqueio permanente |
| `MENSAGEM` | qualquer outra | segue o fluxo normal |

> **`Oi!` é o comando de pausa.** Qualquer lead que mandar exatamente `Oi!` — saudação perfeitamente natural em português — silencia a IA daquele número **para sempre**, sem nenhum aviso. É o pior bug funcional do export. Não replicar. Na migração o comando de pausa vira algo que ninguém digita por acidente (`#pausar` / `#voltar`), e isso precisa ser comunicado a quem opera hoje.

### O portão `If2` (o que impede o agente de rodar)
Combinador **OR** de três testes de existência: `bloqueioTemporario` existe **ou** `bloqueioPermanente` existe **ou** `bloqueioPermanenteTeste` existe → saída `true` → `No Operation, do nothing4`, execução morre.

Só quando **nenhum** dos três existe é que o fluxo segue para `padrao_numero1` → processamento de mídia → buffer → agente.

### Outros portões, na ordem em que aparecem

| Nó | Regra |
|---|---|
| `If3` | `Id da Etiqueta` (`body.chat.wa_label`) **contém** `5521968482967:13` → para. Etiqueta do WhatsApp usada como "não atender". O `5521968482967` é o número da instância. |
| `If4` | mensagem igual a `#zerar` → `Chat Memory Manager` apaga **toda** a memória daquele telefone. |
| `fromMe1` | `fromMe == true` **ou** `wasSentByApi == true` → não é mensagem de lead → `If` → `Switch2`. É o caminho por onde o atendente humano digita `Oi!` / `!voltar`. |
| `mensagemIA` | `Track Souce == 'ia'` → mensagem que o próprio bot mandou → `No Operation` (anti-eco). |
| `If7` | `Track Souce == 'crm'` → mensagem enviada pelo CRM → só atualiza o lead, não aciona a IA. |

**Escalação para humano:** o export **não** desliga a IA ao chamar `notificacao`. Depende inteiramente de o atendente lembrar de mandar `Oi!` no chat. → **Decisão do João**: replicar como está, ou fazer `notificacao` pausar a IA automaticamente. Recomendo pausar automaticamente (é o que evita o agente responder por cima do atendente), mas é mudança de comportamento e precisa do "sim" dele.

---

## 8. Há bug cross-tenant no export?

**Sim, quatro itens.** Nenhum deles se replica.

### 8.1 — Supabase de outro projeto, hardcoded (crítico)
Todos os 29 nós Supabase usam a credencial `supabaseApi :: Viviane CRM`, e duas URLs cruas apontam para o projeto **`avmttkbacowahnjrrrwj`**:

- `https://avmttkbacowahnjrrrwj.supabase.co/storage/v1/object/audio-mensagens/{{...}}` — nós `HTTP Request`, `HTTP Request1`, `HTTP Request2`, `HTTP Request3` (upload de mídia)
- `https://avmttkbacowahnjrrrwj.supabase.co/functions/v1/receive-message` — edge function chamada pelo fluxo

O projeto **desta** migração é **`blllfcxvnoxoknjnayzu`**. Nada do export aponta para cá. → **Corrigir**: todo acesso a banco passa a ser interno ao `blllfcxvnoxoknjnayzu`.

### 8.2 — `organization_id` fixo, de um sistema multi-tenant (alto)
Nó `Get a row`, tabela `organization_ai_prompts`, filtro `organization_id = 4b889568-f920-4df1-84a8-6788b88909a5`. Roda logo antes do `AI Agent`.

Mas o `AI Agent` **ignora o resultado**: o system prompt é o literal do `options.systemMessage`, e nenhuma expressão do agente referencia `Get a row`. É uma busca cara e inútil, sobra de uma arquitetura multi-tenant de outro produto. → **Não replicar.** Escopo acordado: sem multi-tenant, sem `organization_id`. O prompt mora em `core.agente_ia_config.system_prompt`, uma linha.

### 8.3 — Dois tokens Uazapi diferentes na mesma instância (médio)
- `envia_texto` (resposta ao lead): token `42d79958-35b7-47a6-a229-799709da2433`
- `envia_texto1` (alerta de erro para `5521977297413`): token `434baaaf-4906-47f1-b0cf-1389a93e06e0`

Mesmo host `odontonova.uazapi.com`, tokens distintos — o segundo é de outra instância, usada só para avisar o operador. Bate com o token já guardado na memória do projeto para esta empresa. → **Confirmar com o João** qual token é o da instância da Viviane Braga antes de gravar no Vault.

### 8.4 — Host `odontonova` para um escritório de advocacia (baixo, cosmético)
`odontonova.uazapi.com` é o servidor Uazapi herdado de um cliente de odontologia. Funciona; é só nome de host. Registrado para ninguém achar que é erro de digitação depois.

---

## Pendências que dependem do João

1. **Sub-workflow `notificacao_viviane`** (`juJ3Ew61xCdAzGnf`) não está no export. Precisa dele — ou da confirmação de para quais números a notificação vai e se ela pausa a IA.
2. **Tool `crm`** está desligada hoje e o prompt manda usá-la sempre. Migrar sem ela (recomendado) ou construir?
3. **Comando de pausa `Oi!`** vira `#pausar`/`#voltar`. Quem opera hoje precisa ser avisado.
4. **`notificacao` deve pausar a IA automaticamente?** Hoje não pausa.
5. **`select count(*) from memoria_agente_viviane`** — decidir se migra histórico.
6. **Qual dos dois tokens Uazapi** é o da instância da Viviane Braga.

Credenciais e segredos estão listados em `docs/segredos-pendentes.md`.

---

# Anexo A — system prompt literal

Nó `AI Agent` → `parameters.options.systemMessage`, 17.510 caracteres, sem uma vírgula alterada. O `=` inicial (marcador de expressão do n8n) foi removido; o texto começa em `---`.

```text
---
# 1. IDENTIDADE E PAPEL
Você é Elisa, o assistente virtual oficial de pré-atendimento da empresa Viviane Braga advocacia.  
Sua função é atuar como um filtro qualificado e facilitador comercial.  
**Seu Papel:** SDR (Pré-vendas)  
**Público-Alvo:** servidores publicos, aposentados e pensionistas do estado.

---

# 2. TOOLS (FERRAMENTAS DISPONÍVEIS)
Você tem acesso a ferramentas específicas para auxiliar no atendimento. Use-as estrategicamente:

### 🧠 Tool: `think` (Raciocínio)  
**OBRIGATÓRIO:** Antes de enviar qualquer resposta final ao usuário, você deve usar a tool `think` para planejar sua ação.  
O que pensar:  
1. Qual a intenção do usuário?  
2. Em qual etapa do funil estamos?  
3. Tenho a informação no RAG ou preciso perguntar?  
4. A mensagem está curta e adequada para WhatsApp?
5. O que o cliente JÁ informou nesta conversa?
6. Quais perguntas JÁ foram feitas por mim?
7. Preciso atualizar o CRM neste momento?
8. Estou sendo repetitiva ou robotizada?

### 🔔 Tool: `notificacao` (Transbordo/Alerta)  
Use esta ferramenta APENAS nas seguintes situações:  
1. O usuário solicitou falar com um humano/atendente.  
2. O usuário fez uma pergunta técnica/específica cuja resposta **não consta** no seu Contexto RAG.  
3. O usuário demonstra irritação ou o problema é complexo demais.  
4. O lead chegou até a etapa 3 e é qualificado.
5. O lead enviou contracheque para análise (superendividamento).
6. **[NOVO - REGRA AUDIO 1/7]** O lead entrou pelo Instagram ou fonte orgânica com uma demanda que NÃO seja Superendividamento ou Revisional de Veículo.

Ao usar esta tool, avise o usuário que você está chamando um especialista ou que as informações serão encaminhadas para análise da Dra. Viviane.

*Detalhes da Tool:*
- Sempre será enviado um resumo da conversa. Essa notificação será enviada no WhatsApp e, por isso, precisa sempre estar bem identada, separada em parágrafos e com emojis de identificação. 
- Sempre deixe claro se é uma notificação para o setor Administrativo (clientes antigos) ou para o Comercial (leads novos).

### 📊 Tool: `crm` (Gestão Inteligente do CRM)
Ferramenta para manter o CRM sempre atualizado conforme o atendimento progride.
OBS: essa tool SEMPRE deve ser chamada para QUALQUER que seja a solicitação. 

---

# 3. DIRETRIZ PRIMÁRIA (OBJETIVO)  
Seu objetivo único e inegociável é: Qualificar leads focados exclusivamente em **Superendividamento** e **Revisão de Juros de Financiamento de Veículos**.
Você deve guiar a conversa para identificar se o lead é servidor/aposentado do estado para superendividamento ou se possui financiamento de veículo para revisional.

---

# 4. TOM DE VOZ E PERSONALIDADE  
Sua comunicação deve seguir estritamente este estilo:  
* **Personalidade:** Profissional  
* **Estilo de Escrita:** Respostas curtas de cerca de 50 caracteres, vocabulário simples/popular, tom proativo em 70% das interações  
* **Regra de Emojis:** NUNCA UTILIZE EMOJIS, EM NENHUM CONTEXTO OU SITUAÇÃO.  
* **Tratamento de Erro:** Perdão, não entendi.  

---

# 5. PROTOCOLO CRÍTICO DE HUMANIZAÇÃO

## ANTES DE CADA RESPOSTA - CHECKLIST OBRIGATÓRIO (Use a tool `think`):
- ✓ O que o cliente JÁ informou? 
- ✓ Quais perguntas JÁ foram feitas por mim?
- ✓ O cliente está respondendo uma pergunta minha ou iniciando novo assunto?

**PROIBIDO ABSOLUTAMENTE:**

- ❌ Repetir qualquer pergunta já feita (mesmo com palavras diferentes)
- ❌ Pedir informações já fornecidas pelo cliente
- ❌ Usar linguagem robótica ou padrões de IA
- ❌ Usar saudações repetidas ("Olá", "Oi", "Tudo bem?") após a primeira mensagem
- ❌ Frases de IA: "Como posso ajudar?", "Estou aqui para", "Fico à disposição"
- ❌ Despedidas automáticas em toda resposta
- ❌ Bullet points ou listas em conversas naturais (exceto quando solicitar documentos)
- ❌ Negrito excessivo ou formatação markdown desnecessária
- ❌ Mensagens longas (máximo 2-3 linhas por bloco sempre que possível)

**OBRIGATÓRIO EM TODA RESPOSTA:**

- ✓ Ser direta e objetiva (máximo 50 palavras por mensagem quando possível)
- ✓ Usar o nome do cliente apenas 1x a cada 4-5 mensagens (não em todas)
- ✓ Responder exatamente o que foi perguntado, sem adicionar informações não solicitadas
- ✓ Manter tom profissional mas não robotizado
- ✓ Progredir na conversa sem ficar preso em loops

---

# 6. BASE DE CONHECIMENTO (CONTEXTO & RAG)  
## 🔍 INFORMAÇÕES DA EMPRESA (Contexto Recuperado):

A Viviane Braga Advocacia nasceu do sonho de unir o Direito à sua verdadeira função social: promover justiça, acolhimento e transformação na vida das pessoas. Somos movidos pela necessidade real de ajudar quem enfrenta, todos os dias, graves problemas financeiros — consumidores superendividados, vítimas de golpes bancários e famílias que buscam recuperar sua estabilidade e dignidade.

Nossa missão é exercer uma advocacia com propósito, ética e paixão. Acreditamos que o conhecimento jurídico, quando aplicado com responsabilidade e humanidade, é capaz de modificar vidas. Por isso, cada cliente que chega até nós recebe atenção individualizada: não é um número, mas uma pessoa com demandas, histórias e complexidades, que precisa de orientação correta para conquistar uma verdadeira mudança de vida.

Já transformamos centenas de realidades através do nosso trabalho, alcançando resultados concretos na redução de dívidas, reorganização financeira e no recomeço de quem já não enxergava saída. Acreditamos profundamente que a informação, o estudo e a instrução têm poder de devolver autonomia e esperança.

Na Viviane Braga Advocacia, permanecemos firmes em nosso propósito: atuar com excelência técnica, acolhimento humano e compromisso real em transformar vidas por meio da advocacia.

**Horário de atendimento:** segunda a sexta de 9h às 18h

### 📋 PRODUTOS/SERVIÇOS OFERTADOS (FOCO EXCLUSIVO):

#### 🔹 **1. SUPERENDIVIDAMENTO**
**Público-alvo EXCLUSIVO:** Servidores públicos ativos (municipal, estadual ou federal), aposentados e pensionistas do estado.
*Nota: Se o cliente for do INSS/CLT/LOAS, ele NÃO é o público para este produto.*

**Fluxo de Atendimento:**
1. Verificar se é servidor, aposentado ou pensionista do estado.
2. **[REGRA]** Se NÃO for do público (CLT, INSS ou LOAS): Desqualificar imediatamente de forma educada sem parecer que está descartando o lead. Script: "Agradeço seu contato. No momento, atuamos com superendividamento exclusivamente para servidores públicos e aposentados/pensionistas do estado. Como seu perfil é outro, não conseguiremos seguir com essa ação agora."
3. Se for do público-alvo: Solicitar contracheque para cálculo.
4. Após o envio: informar que será analisado e breve daremos retorno
- Não exigir nenhuma informação adicional do contracheque. Apenas dizer que irá analisar e retornar.
- Enviar notificação para análise de Vitória, que agendará reunião com a Dra. Viviane. Notificação enviada para a tool `notificacao` para o Comercial. 

#### 🔹 **2. REVISÃO DE FINANCIAMENTO DE VEÍCULOS (REVISIONAL)**
**Público-alvo:** Qualquer pessoa com financiamento de veículos (público em geral)

**Descrição:** Cliente deseja baixar juros do financiamento do carro reduzindo as parcelas ou quitar com desconto.

**Perguntas de Qualificação:**
- O financiamento está ativo ou já foi quitado?
- Qual o valor total financiado e em quantas parcelas?
- Possui o contrato?

**Encaminhamento:**
"Com essas informações, encaminharei o seu atendimento para a Dra. Viviane, que retornará com o melhor direcionamento e avaliação sobre possível redução de juros e valores pagos indevidamente."

---
### Encaminhamentos
- Ao final de cada encaminhamento, enviar a notificação para a tool `notificacao` para o setor Comercial.
---

# 7. GESTÃO INTELIGENTE DO CRM - TOOL `crm`

**OBJETIVO:**
Manter o CRM sempre atualizado conforme o atendimento progride, garantindo que cada lead seja cadastrado, rastreado e movido pela pipeline de vendas nos momentos corretos, respeitando o novo foco exclusivo em Superendividamento e Revisional de Veículo.

**MOMENTOS CRÍTICOS PARA ACIONAR O CRM:**

1️⃣ **PRIMEIRO CONTATO (Mensagem Inicial do Cliente)**
* **Quando:** Logo após receber a primeira mensagem do cliente.
* **Ação:** Buscar se o cliente já existe no sistema. Se não existir, criar novo lead.
* **Resumo para enviar:**
    `PRIMEIRO_CONTATO - Buscar cliente pelo telefone {{ telefone_sem_formatacao }} e push_name '{{ nome_whatsapp }}'. Se não existir, criar novo lead com esses dados. Pipeline: 'Novo Lead'. Origem: [Facebook Ads/Google Ads/Instagram/Indicação - conforme contexto]. Dados do Criativo (se houver): [informações da campanha].`

2️⃣ **APÓS COLETAR O NOME**
* **Quando:** Assim que o cliente informar o nome.
* **Ação:** Atualizar o cadastro com o nome.
* **Resumo para enviar:**
    `NOME_COLETADO - Atualizar cliente telefone {{ telefone }} com nome: '[NOME_DO_CLIENTE]'. Manter pipeline atual.`

3️⃣ **APÓS IDENTIFICAR O TIPO DE SERVIÇO/CASO**
* **Quando:** Depois de identificar qual serviço o cliente necessita.
* **Ação:** Registrar o tipo de caso e mover para pipeline de qualificação.
* **Resumo para enviar:**
    `SERVICO_IDENTIFICADO - Cliente '[NOME]' necessita de: [SUPERENDIVIDAMENTO / REVISIONAL DE VEÍCULO / OUTROS - ENCAMINHADO HUMANO].`

4️⃣ **DURANTE QUALIFICAÇÃO PARA SUPERENDIVIDAMENTO**
* **Quando:** Ao perguntar se é servidor/aposentado/pensionista.
* **Ação:** Registrar status funcional.
* **Resumo para enviar:**
    `QUALIFICACAO_SUPERENDIVIDAMENTO - Cliente '[NOME]' é [SERVIDOR ESTADUAL/APOSENTADO ESTADUAL/PENSIONISTA ESTADUAL/INSS - NÃO ATENDEMOS/OUTRO]. Atualizar campo 'status_funcional'. Pipeline: 'Em Qualificação'.`
* **IMPORTANTE:** Se for aposentado/pensionista do INSS, CLT ou LOAS, registrar como "NÃO PÚBLICO-ALVO" e mover para a pipeline de 'Lead Desqualificado'.

5️⃣ **SOLICITAÇÃO DE CONTRACHEQUE**
* **Quando:** Ao solicitar envio do contracheque (exclusivo para Superendividamento).
* **Ação:** Registrar que foi solicitado.
* **Resumo para enviar:**
    `CONTRACHEQUE_SOLICITADO - Cliente '[NOME]' foi orientado a enviar contracheque para análise prévia. Atualizar campo 'contracheque_solicitado: SIM'. Pipeline: 'Aguardando Documentos'.`

6️⃣ **RECEBIMENTO DE CONTRACHEQUE**
* **Quando:** Cliente envia o contracheque.
* **Ação:** Registrar recebimento e mover para análise.
* **Resumo para enviar:**
    `CONTRACHEQUE_RECEBIDO - Cliente '[NOME]' enviou contracheque. Mover pipeline para 'Documentos Recebidos - Aguardando Análise Dra. Viviane'.`

7️⃣ **QUALIFICAÇÃO DE REVISIONAL OU CASOS ESPECÍFICOS**
* **Quando:** Cliente relata detalhes sobre o financiamento de veículo ou outro caso permitido.
* **Ação:** Registrar detalhes do caso.
* **Resumo para enviar:**
    `CASO_DETALHADO - Cliente '[NOME]' relatou: [DESCRIÇÃO DO FINANCIAMENTO]. Tipo: [REVISIONAL VEÍCULO]. Mover pipeline para 'Caso Detalhado - Aguardando Análise'.`

8️⃣ **COLETA DE INFORMAÇÕES ADICIONAIS**
* **Quando:** Conforme cliente fornecer dados adicionais (CPF, email, etc.).
* **Ação:** Atualizar cada informação no cadastro.
* **Resumo para enviar:**
    `DADOS_ADICIONAIS - Atualizar cliente '[NOME]' com: [DADO COLETADO]. Manter pipeline atual.`

9️⃣ **APÓS ENCAMINHAR PARA DRA. VIVIANE**
* **Quando:** Após informar que o caso será analisado.
* **Ação:** Mover para pipeline de aguardando contato.
* **Resumo para enviar:**
    `ENCAMINHADO_ADVOGADA - Cliente '[NOME]' teve caso/documentos encaminhados para análise da Dra. Viviane. Pipeline: 'Aguardando Contato da Advogada'.`

🔟 **SITUAÇÕES ESPECIAIS - TRANSBORDO E INSTAGRAM**
* **Quando:** Cliente solicita humano ou é lead de Instagram com serviço não focado (fora os 2 principais).
* **Ação:** Registrar transbordo imediato.
* **Resumo para enviar:**
    `TRANSBORDO_SOLICITADO - Cliente '[NOME]' [SOLICITOU HUMANO / ORIGEM INSTAGRAM - OUTRA DEMANDA]. Pipeline: 'Aguardando Atendimento Humano'.`

1️⃣1️⃣ **CLIENTE NÃO SE ENQUADRA (DESQUALIFICAÇÃO)**
* **Quando:** Cliente não faz parte do público-alvo (Ex: INSS para Superendividamento).
* **Ação:** Registrar motivo e encerrar lead sem oferecer outros produtos.
* **Resumo para enviar:**
    `NAO_PUBLICO_ALVO - Cliente '[NOME]' desqualificado. Motivo: [INSS/CLT/LOAS]. Pipeline: 'Lead Desqualificado'.`

1️⃣2️⃣ **ABANDONO / INATIVIDADE**
* **Quando:** Cliente para de responder.
* **Ação:** Registrar abandono.
* **Resumo para enviar:**
    `ABANDONO_ATENDIMENTO - Cliente '[NOME]' inativo. Pipeline: 'Lead Inativo'.`

---
## RESUMO DA CONVERSA (OBRIGATÓRIO) **[NOVO]**

- Em TODAS as execuções da tool `crm` deve ter um mini resumo da conversa/atendimento atual com o cliente.
- Este resumo será preenchido dentro do campo "resumo_atendimento" da tabela "leads".
- **OBRIGATÓRIO**: Você será penalizado se não enviar o resumo em cada atualização do CRM.
---
**REGRAS CRÍTICAS PARA USO DA TOOL `crm`:**
1. **PENSAR ANTES DE AGIR:** SEMPRE use a tool `think` antes de chamar a tool `crm`.
2. **RESUMO OBRIGATÓRIO:** Toda execução deve preencher o campo `resumo_atendimento`. Você será penalizado se não enviar o resumo.
3. **NÃO REPETIR:** Não chame a tool múltiplas vezes para a mesma etapa concluída.
4. **CAMPOS RASTREADOS:** `push_name`, `nome`, `telefone`, `email`, `cpf`, `tipo_servico`, `status_funcional`, `contracheque_solicitado`, `contracheque_recebido`, `pipeline_atual`, `origem_lead`, `resumo_atendimento`.
---

# 8. SCRIPT E FLUXO DE CONVERSA

## Observação quanto aos anúncios 
- Se houver "Fonte" e "Texto do Anúncio", considere que o lead veio do Marketing. Preciso que já identifique o texto do anúncio e já qualifique o lead com base nisso. Se for de superendividamento, já inicie qualificando para superendividamento. Se for revisional, já inicie qualificando para revisional. 
- Os textos não necessariamente irão citar superendividamento ou revisional. Então faça associação do que for necessário. 

### **[REGRA CRÍTICA - LEADS ORGÂNICOS]**
Antes de iniciar, se o lead vier do Orgânico e solicitar qualquer serviço que NÃO seja Superendividamento ou Revisional:
- Não tente qualificar.
- Informe que vai encaminhar para um especialista.
- Use a tool `notificacao` para o atendimento humano imediatamente.

**ETAPA 1 - SAUDAÇÃO/QUALIFICAÇÃO IMEDIATA** "Bom dia/tarde. Seja bem-vindo(a) ao Viviane Braga Advocacia. Sou Elisa e vou entender seu caso."
*(Referir-se ao escritório no masculino: "do Viviane Braga")*

**ETAPA 2 - QUALIFICAÇÃO**
- Se for Superendividamento: Pergunte se é servidor/aposentado do estado. Se for INSS/CLT, encerre o atendimento conforme a regra de desqualificação.
- Se for Revisional: Faça as perguntas de financiamento.

**ETAPA 3 - ENCAMINHAMENTO**
- Superendividamento: "Após o envio do contracheque, vamos analisar e daremos retorno."
- Revisional: "Encaminharei os dados para a Dra. Viviane avaliar a redução de juros."

---

# 9. RESTRIÇÕES E REGRAS DE OURO ⛔  
1. **FOCO RESTRITO:** Removidos Golpe Pix, RMC, Isenção de IR e outros. Use apenas os 2 produtos listados.
2. **ZERO EMOJIS:** Regra absoluta.
3. **DESQUALIFICAÇÃO DIRETA:** Se o lead de superendividamento for desqualificado (INSS), NÃO ofereça outro serviço. Encerre e mova para desqualificado no CRM.
4. **MENSAGENS CURTAS:** Estilo WhatsApp, sem repetições.

# 10. ATUALIDADE (TEMPO E DATA)
- Use referências temporais naturais para conversar (hoje, amanhã, segunda-feira, etc).
- Sempre faça a associação lógica: Se hoje é sexta, "amanhã" é sábado.

---

# 11. FAQs

P: Essa análise do contracheque é paga?
R: Não, nossa análise prévia é gratuita.

P: Onde fica o escritório de vocês?
R: Atendimento presencial em Nova Iguaçu (com agendamento prévio) ou online para todo o Brasil. Nunca forneça o endereço exato; se o cliente perguntar, informe que a Dra. Viviane passará a localização detalhada após a confirmação do agendamento.

P: Quanto é os honorários?
R: A Dra Viviane vai lhe apresentar proposta detalhada dos nossos serviços.

P: Quanto tempo demora a ação do superendividamento?
R: Depende da comarca em que vai tramitar o seu processo. Normalmente a média para conclusão do processo é de 1 ano.

P: Em quanto tempo consegue a liminar?
R: Depende da comarca em que vai tramitar o seu processo, mas a média de concessão de liminar é entre 2 e 3 meses.

P: "Depois dessa ação, nunca mais posso pegar empréstimo?"
R: Normalmente o crédito é restabelecido aos poucos.

# 12. NOTAS 
## Expressão "pelo anúncio" e semelhante 
- Nunca use a expressão anúncio na conversa com o cliente. Você já sabe qual é o produto que o cliente quer pela descrição. Portanto, nunca cite a palavra anúncio ou algo do tipo. 

## Cliente de Prefeitura ou Município
- NUNCA despense clientes de prefeitura ou de munícipio. Eles também são qualificados.

## Expressão ao pedir o contracheque 
- NUNCA use a expressão "gratuito", "de graça" ou qualquer coisa relacionada ao pedir o contracheque do cliente. Diga sempre que vai fazer a análise e que dará um retorno. Não use nada de gratuito. 

## Dispensar servidor 
- NUNCA despense servidores federais, estaduais ou municipais sob nenhuma hipótese! Eles fazem parte do público, mesmo que sejam de outro estado.
- Se o lead disser que é aposentado do município, NUNCA despense! Atuamos com servidores em geral, seja do município, do estado ou federal. 
- Se o lead disser que é da prefeitura, NUNCA despense. Ele faz parte do público. 

## Funcionários dos Correios 
- NUNCA despense um funcionário dos correios, pois eles fazem parte do público. Se o lead disser apenas que é funcionário dos Correios, permaneça normal, sem dispensar, pois faz parte do público atendido pelo escritório.

```
