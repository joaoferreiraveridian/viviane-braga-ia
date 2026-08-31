import {
  AlertTriangle,
  Brain,
  MessageSquareText,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BadgeProps } from "@/components/ui/badge";

import { capitalizar } from "./shared/format";
import { STATUS_EXECUCAO, STEP_TIPOS, type PeriodoIa, type PresetPeriodoIa, type StatusExecucao, type StepTipo } from "./types";

// ---------------------------------------------------------------------------
// Período — mesmo desenho de `financeiro-format.ts`/`dashboard-format.ts`,
// duplicado aqui deliberadamente (frentes paralelas, sem acoplamento entre
// módulos). Sem granularidade: esta tela não desenha série temporal, só
// filtra `fn_agente_execucao_lista`/`fn_agente_execucao_resumo` por `p_desde`/`p_ate`.
// ---------------------------------------------------------------------------

/** Início de 2026 como limite inferior de navegação do calendário "Personalizado" — o agente comercial é recente, não há necessidade de voltar a 2017 como o financeiro. */
export const DATA_MINIMA_IA = new Date(2026, 0, 1, 0, 0, 0, 0);

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}
function fimDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 23, 59, 59, 999);
}
function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1, 0, 0, 0, 0);
}
function fimDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth() + 1, 0, 23, 59, 59, 999);
}

interface DefinicaoPresetIa {
  id: PresetPeriodoIa;
  label: string;
  calcular: (agora: Date) => { inicio: Date; fim: Date };
}

export const PRESETS_PERIODO_IA: DefinicaoPresetIa[] = [
  { id: "hoje", label: "Hoje", calcular: (agora) => ({ inicio: inicioDoDia(agora), fim: agora }) },
  {
    id: "7_dias",
    label: "7 dias",
    calcular: (agora) => ({ inicio: inicioDoDia(new Date(agora.getTime() - 6 * 86_400_000)), fim: agora }),
  },
  {
    id: "30_dias",
    label: "30 dias",
    calcular: (agora) => ({ inicio: inicioDoDia(new Date(agora.getTime() - 29 * 86_400_000)), fim: agora }),
  },
  { id: "este_mes", label: "Este mês", calcular: (agora) => ({ inicio: inicioDoMes(agora), fim: fimDoMes(agora) }) },
  {
    id: "mes_passado",
    label: "Mês passado",
    calcular: (agora) => {
      const mesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
      return { inicio: inicioDoMes(mesPassado), fim: fimDoMes(mesPassado) };
    },
  },
  { id: "tudo", label: "Tudo", calcular: (agora) => ({ inicio: DATA_MINIMA_IA, fim: agora }) },
];

export function periodoIaPersonalizado(inicio: Date, fim: Date): PeriodoIa {
  return { inicio: inicioDoDia(inicio), fim: fimDoDia(fim), presetId: "personalizado" };
}

/** Intervalo em ISO para `p_desde`/`p_ate`. */
export function periodoIaParaIso(periodo: PeriodoIa): { desdeIso: string; ateIso: string } {
  return { desdeIso: periodo.inicio.toISOString(), ateIso: periodo.fim.toISOString() };
}

/** Rótulo do período aplicado — sempre visível ao lado dos números do resumo, mesma exigência de procedência do resto da plataforma. */
export function formatarIntervaloPeriodoIa(periodo: PeriodoIa): string {
  const opcoes: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  const inicio = periodo.inicio.toLocaleDateString("pt-BR", opcoes);
  const fim = periodo.fim.toLocaleDateString("pt-BR", opcoes);
  if (inicio === fim) return inicio;
  return `${inicio} – ${fim}`;
}

const ROTULO_STATUS: Record<StatusExecucao, string> = {
  pending: "Pendente",
  running: "Em andamento",
  succeeded: "Sucesso",
  failed: "Erro",
  skipped: "Pulada",
};

/** Rótulo em português para um status de execução — valor fora do vocabulário conhecido cai no fallback capitalizado, nunca escondido. */
export function rotuloStatusExecucao(status: string): string {
  return ROTULO_STATUS[status as StatusExecucao] ?? capitalizar(status.replace(/_/g, " "));
}

/**
 * Variante de cor por status — escala neutra/semântica, nunca dourado (regra
 * "dourado nunca é cor de status"). `failed` é a única variante `destructive`:
 * erro precisa ser visualmente distinto de "sem dado" ou de um estado neutro
 * como `pending`/`skipped`. `succeeded` é `success`. `running`/`pending`
 * ficam neutros (`secondary`/`outline`) — ainda em curso, não é falha nem
 * sucesso. `skipped` é `outline`: decisão deliberada do agente, não erro.
 */
const VARIANTE_STATUS: Record<StatusExecucao, NonNullable<BadgeProps["variant"]>> = {
  pending: "outline",
  running: "secondary",
  succeeded: "success",
  failed: "destructive",
  skipped: "outline",
};

export function varianteStatusExecucao(status: string): NonNullable<BadgeProps["variant"]> {
  return VARIANTE_STATUS[status as StatusExecucao] ?? "outline";
}

export function opcoesStatusExecucao(): Array<{ valor: StatusExecucao; rotulo: string }> {
  return STATUS_EXECUCAO.map((valor) => ({ valor, rotulo: ROTULO_STATUS[valor] }));
}

const ROTULO_STEP: Record<StepTipo, string> = {
  llm_call: "Chamada ao modelo",
  tool_call: "Chamada de ferramenta",
  tool_result: "Resultado de ferramenta",
  thinking: "Raciocínio",
  send_message: "Envio de mensagem",
  error: "Erro",
};

export function rotuloStepTipo(tipo: string): string {
  return ROTULO_STEP[tipo as StepTipo] ?? capitalizar(tipo.replace(/_/g, " "));
}

/** Ícone por tipo de passo — cada `step_type` tem um ícone distinto (lucide-react), erro sempre reconhecível mesmo sem ler o rótulo. */
const ICONE_STEP: Record<StepTipo, LucideIcon> = {
  llm_call: Sparkles,
  tool_call: Wrench,
  tool_result: Zap,
  thinking: Brain,
  send_message: MessageSquareText,
  error: AlertTriangle,
};

export function iconeStepTipo(tipo: string): LucideIcon {
  return ICONE_STEP[tipo as StepTipo] ?? Zap;
}

/** Todos os tipos de passo conhecidos, na ordem canônica declarada na tarefa — usado só para referência/legenda, nunca para filtrar dado real. */
export function opcoesStepTipo(): StepTipo[] {
  return [...STEP_TIPOS];
}

/** Latência em milissegundos, formatada com unidade adaptativa (ms/s) — sempre `.tabular` no lugar de renderização, esta função só devolve o texto. */
export function formatarLatencia(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms.toLocaleString("pt-BR")} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

/** Contagem de tokens formatada com separador de milhar — nunca abreviada, o operador precisa do número exato para custo. */
export function formatarTokens(tokens: number | null): string {
  if (tokens === null) return "—";
  return tokens.toLocaleString("pt-BR");
}

/** Custo em USD — sempre 4 casas decimais, porque uma execução isolada custa frações de centavo e arredondar a 2 casas mostraria "US$ 0,00" para tudo. */
export function formatarCustoUsd(valor: number | null): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(
    valor,
  );
}

/** Custo agregado (resumo do período) — 2 casas decimais bastam quando somado, o total já sai maior que frações de centavo isoladas. */
export function formatarCustoUsdTotal(valor: number | null): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(valor);
}

/** Resumo curto e legível de um valor jsonb (input/output de passo) para exibição colapsada — a expansão mostra o JSON cru completo à parte. */
export function resumirJson(valor: unknown, tamanhoMaximo = 140): string {
  if (valor === null || valor === undefined) return "—";
  let texto: string;
  try {
    texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  } catch {
    texto = String(valor);
  }
  if (!texto) return "—";
  if (texto.length <= tamanhoMaximo) return texto;
  return `${texto.slice(0, tamanhoMaximo)}…`;
}

/** Data/hora curta em pt-BR — usado para `created_at` de execução e passo, onde o dado é um instante histórico (não "recência de atualização", que é o que `RecencyBadge` comunica). */
export function formatarDataHora(dataIso: string): string {
  return new Date(dataIso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** JSON formatado para o bloco expandido — sempre `JSON.stringify` com indentação, nunca reformatação heurística. */
export function jsonFormatado(valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor, null, 2);
  } catch {
    return String(valor);
  }
}
