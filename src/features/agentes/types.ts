/**
 * Tipos do módulo IA — gerência do agente de WhatsApp do comercial
 * presencial. Não existe hoje uma segunda IA de suporte na plataforma (esse
 * fluxo roda em n8n, fora de escopo); esta tela cobre só o agente comercial.
 *
 * Espelham 1:1 o contrato combinado com quem publicou as RPCs/views em
 * paralelo (`api.fn_agente_execucao_lista`, `api.fn_agente_execucao_resumo`,
 * `api.vw_agente_execucao_passo`, `api.vw_agente_config`, `api.vw_agente_tool`,
 * `api.vw_agente_fila_pendente`). Nenhum campo aqui foi presumido além do que o
 * contrato descreve.
 */

export type PresetPeriodoIa = "hoje" | "7_dias" | "30_dias" | "este_mes" | "mes_passado" | "tudo" | "personalizado";

/** Intervalo fechado (`inicio`/`fim` inclusive) que `fn_agente_execucao_lista`/`fn_agente_execucao_resumo` usam como filtro obrigatório. */
export interface PeriodoIa {
  inicio: Date;
  fim: Date;
  presetId: PresetPeriodoIa;
}

export const STATUS_EXECUCAO = ["pending", "running", "succeeded", "failed", "skipped"] as const;
export type StatusExecucao = (typeof STATUS_EXECUCAO)[number];

export const STEP_TIPOS = ["llm_call", "tool_call", "tool_result", "thinking", "send_message", "error"] as const;
export type StepTipo = (typeof STEP_TIPOS)[number];

/**
 * Recorte da aba Execuções além do período. Vai inteiro para
 * `api.fn_agente_execucao_lista` (parâmetros novos da migração 0011).
 * Um objeto em vez de mais quatro parâmetros posicionais — a assinatura já
 * estava no limite do legível.
 */
export interface FiltrosExecucao {
  /** Vazio = todos os status. */
  status: string[];
  /** Nome do lead, telefone (em qualquer formato) ou trecho da mensagem. */
  busca: string;
  /** `null` = qualquer ferramenta. */
  ferramenta: string | null;
}

/** Uma linha de `api.fn_agente_execucao_lista` — uma execução do agente. */
export interface ExecucaoItem {
  runId: string;
  leadId: string | null;
  leadNome: string | null;
  leadTelefone: string | null;
  status: StatusExecucao | string;
  model: string | null;
  provider: string | null;
  inputText: string | null;
  outputText: string | null;
  finishReason: string | null;
  totalTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  totalSteps: number | null;
  ferramentasUsadas: string[];
  partesEnviadas: number | null;
  ultimoStepTipo: string | null;
  ultimoStepErro: string | null;
}

/** A linha única de `api.fn_agente_execucao_resumo` — agregado do período filtrado. */
export interface ExecucaoResumo {
  totalRuns: number;
  succeeded: number;
  failed: number;
  skipped: number;
  pending: number;
  running: number;
  custoTotalUsd: number | null;
  tokensTotais: number | null;
  latenciaMediaMs: number | null;
}

/** Uma linha de `api.vw_agente_execucao_passo` — um passo da timeline de uma execução. */
export interface ExecucaoPasso {
  passoId: string;
  runId: string;
  stepIndex: number;
  stepType: StepTipo | string;
  toolName: string | null;
  input: unknown;
  output: unknown;
  tokens: number | null;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
}

/** A linha única (hoje) de `api.vw_agente_config` — configuração ativa do agente. */
export interface AgenteConfig {
  configId: string;
  organizationId: string | null;
  provider: string | null;
  model: string | null;
  temperature: number | null;
  systemPrompt: string | null;
  debounceSeconds: number | null;
  debounceSecondsTest: number | null;
  testPhones: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Uma linha de `api.vw_agente_tool` — uma ferramenta disponível para o agente. */
export interface AgenteTool {
  toolId: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  schema: unknown;
  createdAt: string;
  updatedAt: string;
}

/** Uma linha de `api.vw_agente_fila_pendente` — mensagem aguardando debounce, ainda não processada. */
export interface FilaPendenteItem {
  bufferId: string;
  leadId: string | null;
  leadNome: string | null;
  phone: string | null;
  content: string | null;
  receivedAt: string;
  consumedAt: string | null;
  runId: string | null;
}

// ---------------------------------------------------------------------------
// Apontamentos do Agente (11/08/2026) — substitui o WhatsApp como canal de
// solicitação de ajuste no agente, suporte OU comercial (por isso mora aqui,
// mesmo a aba de Execuções acima cobrir só o comercial). Espelha
// `api.vw_agente_apontamento`, que por sua vez lê de `core.agente_apontamento`
// — ver a migration `criar_agente_apontamento`.
// ---------------------------------------------------------------------------

