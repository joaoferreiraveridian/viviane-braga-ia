// =============================================================================
// llm.ts — cliente OpenRouter (chat completions + tool calling)
// =============================================================================
// Cópia do template agente-n8n-supabase/template/functions/agente-run/llm.ts.
// Mesmo protocolo de chamada, mesma extração de usage/cost — não reescrever
// esta lógica de cabeça. Único ajuste: headers de atribuição (identificam
// esta function nos logs da OpenRouter) e remoção de `any` (nenhum `any` no
// código desta Onda).

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Custo em USD desta chamada específica. Só vem preenchido se pedirmos
   *  `usage: { include: true }` no corpo da requisição (ver callOpenRouter). */
  cost?: number;
}

export interface OpenRouterResult {
  message: ChatMessage;
  finish_reason: string | null;
  usage: OpenRouterUsage | null;
  raw: unknown;
  latency_ms: number;
}

export interface CallOpenRouterOptions {
  apiKey: string;
  model: string;
  /** Sempre null neste agente — ver nota em agente-run/index.ts sobre por que
   *  a temperatura nunca é enviada (fidelidade ao comportamento do n8n). */
  temperature?: number | null;
  messages: ChatMessage[];
  tools: ToolDefinition[];
}

interface OpenRouterChoice {
  message: ChatMessage;
  finish_reason?: string | null;
}

interface OpenRouterResponseBody {
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage | null;
}

export class OpenRouterError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/**
 * Chama o endpoint de chat completions da OpenRouter, com tool calling.
 *
 * NOTA SOBRE CUSTO (cost_usd em core.agente_ia_run): pedimos
 * `usage: { include: true }` no corpo — é a forma documentada da OpenRouter de
 * devolver `usage.cost` (USD) já calculado por eles para aquela chamada
 * específica. Se a resposta não trouxer `usage.cost`, cost_usd fica null.
 */
export async function callOpenRouter(opts: CallOpenRouterOptions): Promise<OpenRouterResult> {
  const start = Date.now();

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    usage: { include: true },
  };
  if (opts.tools.length > 0) {
    body.tools = opts.tools;
  }
  if (opts.temperature !== null && opts.temperature !== undefined) {
    body.temperature = opts.temperature;
  }

  let resp: Response;
  try {
    resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        // Headers recomendados pela OpenRouter para atribuição/rate-limit por app.
        'HTTP-Referer': 'http://localhost:5173',
        'X-Title': 'Viviane Braga - agente-run',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new OpenRouterError(`Erro de rede ao chamar OpenRouter: ${(err as Error).message}`);
  }

  const latency_ms = Date.now() - start;
  const rawText = await resp.text();
  let json: OpenRouterResponseBody;
  try {
    json = rawText ? (JSON.parse(rawText) as OpenRouterResponseBody) : {};
  } catch {
    throw new OpenRouterError(`OpenRouter retornou corpo não-JSON (status ${resp.status}): ${rawText}`);
  }

  if (!resp.ok) {
    throw new OpenRouterError(`OpenRouter respondeu ${resp.status}: ${rawText}`, json);
  }

  const choice = json.choices?.[0];
  if (!choice) {
    throw new OpenRouterError(`OpenRouter não retornou nenhuma "choice": ${rawText}`, json);
  }

  return {
    message: choice.message,
    finish_reason: choice.finish_reason ?? null,
    usage: json.usage ?? null,
    raw: json,
    latency_ms,
  };
}
