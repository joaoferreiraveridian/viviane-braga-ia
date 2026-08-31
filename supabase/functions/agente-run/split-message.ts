// =============================================================================
// split-message.ts — Splitter de mensagens WhatsApp
// =============================================================================
// Reimplementação em TypeScript do nó n8n "Code in JavaScript4" (JS puro, sem
// IA) — o divisor de mensagens REAL em produção para este agente. O nó
// "Parser Chain" (dividia via LLM) estava morto no export (sem conexão de
// entrada) e não foi migrado.
//
// DIVERGÊNCIA ENCONTRADA E CORRIGIDA em relação ao template
// agente-n8n-supabase (que é cópia do split-message.ts de outro agente, da VR
// Concept): o template comenta que a troca "Prazer" -> "Feliz em conhecer" foi
// removida de propósito para aquele outro agente. Mas o "Code in JavaScript4"
// REAL deste export (n8n/agente-base-viviane_braga.json, nó em ~linha 5041)
// faz exatamente essa troca:
//   text.replace(/\bPrazer\b/g, 'Feliz em conhecer')
// Como é comportamento real em produção para ESTE agente, foi reintroduzida
// abaixo — não é a mesma decisão do outro agente, é fidelidade a este export.

/** Limite de caracteres por mensagem. */
export const SPLIT_MAX_CHARS = 500;

/**
 * DIVERGÊNCIA DELIBERADA do n8n, pedida pelo João em 30/08.
 *
 * O `Code in JavaScript4` empilhava sentenças num buffer guloso até 500
 * caracteres, então qualquer resposta abaixo disso saía numa mensagem só —
 * inclusive a saudação de 110 caracteres ("Boa noite. Seja bem-vindo(a) ao
 * Viviane Braga Advocacia. Sou Elisa, e vou entender seu caso. Como posso
 * ajudar?"). O n8n fazia o mesmo; não era bug de migração, era o teto alto.
 *
 * Regra nova: UMA MENSAGEM POR SENTENÇA, exceto quando o trecho acumulado
 * ainda estiver abaixo deste mínimo — aí ele cola na sentença seguinte, para
 * não sair mensagem solta de duas palavras. Vale nas duas pontas: sobra curta
 * no fim gruda na anterior.
 *
 * SPLIT_MAX_CHARS continua valendo como teto de segurança para sentença
 * gigante (fallback de quebra por linha).
 *
 * ponytail: constante, não coluna de config. Se o "feeling" da quebra virar
 * assunto recorrente, promover para core.agente_ia_config (a aba Configuração
 * já edita as outras) em vez de recompilar.
 */
export const SPLIT_MIN_CHARS = 25;

/**
 * Normaliza formatação Markdown -> WhatsApp, e a troca de humanização
 * "Prazer" -> "Feliz em conhecer" que o "Code in JavaScript4" original faz.
 */
function normalizeFormatting(text: string): string {
  // "**negrito**" (Markdown) -> "*negrito*" (negrito do WhatsApp).
  text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
  // "Prazer" -> "Feliz em conhecer" (humanização, comportamento real do n8n).
  text = text.replace(/\bPrazer\b/g, 'Feliz em conhecer');
  return text;
}

/**
 * Um bloco é uma "lista" (bullet points com "-") se tiver mais de uma linha e
 * TODAS as linhas começarem com "-" (ou forem vazias). Listas são mantidas
 * como uma única mensagem indivisível (não quebram no meio).
 */
function isBulletList(block: string): boolean {
  const lines = block.trim().split('\n');
  return lines.length > 1 && lines.every((l) => l.trim().startsWith('-') || l.trim() === '');
}

/**
 * Remove o ponto final de uma mensagem (humaniza: no WhatsApp real, pouca
 * gente termina toda frase com ponto).
 */
function removeTrailingPeriod(text: string): string {
  return text.replace(/\.\s*$/, '');
}

/**
 * Divide o texto em blocos respeitando, NESTA ORDEM:
 *   1. Parágrafos (quebra dupla de linha \n\n ou mais) são a unidade-mãe.
 *   2. Um parágrafo que é uma lista de bullets vira UM bloco indivisível.
 *   3. Parágrafos normais viram UMA MENSAGEM POR SENTENÇA (delimitada por
 *      ".", "!" ou "?"), com as curtas coladas — ver SPLIT_MIN_CHARS.
 *   4. Se uma ÚNICA sentença ultrapassar SPLIT_MAX_CHARS sozinha, ela é
 *      subdividida por linha ("\n") como último recurso.
 */
function splitMessage(text: string): string[] {
  const results: string[] = [];

  // Divide por quebra de linha dupla (parágrafos).
  const paragraphs = text.split(/\n{2,}/);

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // Listas: mantém como bloco único indivisível.
    if (isBulletList(trimmed)) {
      results.push(trimmed);
      continue;
    }

    // Onde as mensagens DESTE parágrafo começam em `results` — a cola do fim
    // não pode atravessar a fronteira de parágrafo e grudar no anterior, que
    // é um bloco deliberadamente separado.
    const inicioDoParagrafo = results.length;

    // Divide por sentenças: ., !, ? — mantém o delimitador junto do trecho.
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    let buffer = '';

    const despejar = () => {
      if (!buffer.trim()) return;
      // Sentença sozinha acima do teto: quebra por linha, último recurso.
      if (buffer.length > SPLIT_MAX_CHARS) {
        let lineBuf = '';
        for (const line of buffer.split('\n')) {
          const lc = lineBuf ? lineBuf + '\n' + line : line;
          if (lc.length <= SPLIT_MAX_CHARS) {
            lineBuf = lc;
          } else {
            if (lineBuf.trim()) results.push(lineBuf.trim());
            lineBuf = line;
          }
        }
        if (lineBuf.trim()) results.push(lineBuf.trim());
      } else {
        results.push(buffer.trim());
      }
      buffer = '';
    };

    for (const sentence of sentences) {
      if (!buffer) {
        buffer = sentence;
      } else if (buffer.length < SPLIT_MIN_CHARS) {
        // Buffer curto demais para virar mensagem sozinho ("Boa noite.")
        // — cola a próxima sentença nele.
        buffer = buffer + ' ' + sentence;
      } else {
        despejar();
        buffer = sentence;
      }
    }

    // Sobra curta no fim ("Ok.") gruda na mensagem anterior em vez de sair
    // solta — mesma intenção do merge acima, na outra ponta.
    //
    // Exceção: sobra terminada em "?" ou "!" NÃO gruda. A pergunta final é o
    // que devolve a palavra ao lead ("Como posso ajudar?") — é beat
    // intencional do agente, não fragmento perdido, e mandá-la sozinha é
    // justamente o que soa humano.
    const sobraEhBeat = /[?!]\s*$/.test(buffer);
    if (buffer.trim() && !sobraEhBeat && buffer.length < SPLIT_MIN_CHARS && results.length > inicioDoParagrafo) {
      const anterior = results.pop() as string;
      const junto = anterior + ' ' + buffer.trim();
      if (junto.length <= SPLIT_MAX_CHARS) {
        results.push(junto);
        buffer = '';
      } else {
        results.push(anterior);
      }
    }
    despejar();
  }

  return results.map((msg) => removeTrailingPeriod(msg)).filter((msg) => msg.trim().length > 0);
}

/**
 * Ponto de entrada público: recebe o texto completo que o agente gerou e
 * devolve as partes já normalizadas e quebradas, NA ORDEM em que devem ser
 * enviadas.
 */
export function splitAgentMessage(rawText: string): string[] {
  const normalized = normalizeFormatting(rawText ?? '');
  return splitMessage(normalized);
}

// =============================================================================
// Teto de partes — segurança para o tempo de execução da Edge Function. Cada
// parte enviada custa uma chamada de rede a whatsapp-send + (exceto a última)
// 3s de espera. Em vez de truncar conteúdo ou falhar silenciosamente,
// agrupamos o excedente na ÚLTIMA mensagem enviada.
// =============================================================================

/** Teto de mensagens separadas por run. */
export const MAX_MESSAGE_PARTS = 12;

export interface CappedSplitResult {
  /** Partes já limitadas a `maxParts`, prontas para envio em sequência. */
  parts: string[];
  /** true se o split original gerou mais partes do que `maxParts`. */
  capped: boolean;
  /** Quantidade de partes que o splitMessage() original teria gerado. */
  originalPartCount: number;
}

export function capMessageParts(parts: string[], maxParts: number = MAX_MESSAGE_PARTS): CappedSplitResult {
  if (parts.length <= maxParts) {
    return { parts, capped: false, originalPartCount: parts.length };
  }

  const head = parts.slice(0, maxParts - 1);
  const tail = parts.slice(maxParts - 1).join('\n\n');
  return { parts: [...head, tail], capped: true, originalPartCount: parts.length };
}

// =============================================================================
// Dedupe de repetição — guarda contra o modelo devolver a resposta inteira
// duplicada dentro do próprio outputText.
// =============================================================================

/**
 * Se as partes já divididas por parágrafo forem uma repetição exata (a lista
 * inteira é N cópias consecutivas de um mesmo bloco menor), mantém só a
 * primeira cópia.
 */
export function dedupeRepeatedParts(parts: string[]): string[] {
  const n = parts.length;
  for (let period = 1; period <= Math.floor(n / 2); period++) {
    if (n % period !== 0) continue;

    let isRepeating = true;
    for (let i = period; i < n; i++) {
      if (parts[i] !== parts[i % period]) {
        isRepeating = false;
        break;
      }
    }

    if (isRepeating) {
      return parts.slice(0, period);
    }
  }

  return parts;
}
