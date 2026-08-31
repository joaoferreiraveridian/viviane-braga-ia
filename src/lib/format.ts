import {
  format,
  formatDistanceToNow,
  type Locale,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const LOCALE: Locale = ptBR;

/**
 * Formata um valor monetário. Padrão: Real brasileiro (BRL).
 * Use o código ISO da moeda (ex: "USD", "EUR") para outras moedas.
 */
export function formatCurrency(value: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formata um número genérico com separadores de milhar no padrão
 * brasileiro. `fractionDigits` controla as casas decimais (padrão 0).
 */
export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Formata uma fração (0 a 1) ou um valor já em pontos percentuais como
 * percentual. Por padrão assume que `value` está em 0–1 (ex: 0.42 -> "42%").
 * Passe `alreadyPercent: true` se `value` já vier como 42.
 */
export function formatPercent(
  value: number,
  options?: { fractionDigits?: number; alreadyPercent?: boolean },
): string {
  const { fractionDigits = 1, alreadyPercent = false } = options ?? {};
  const normalized = alreadyPercent ? value / 100 : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(normalized);
}

/**
 * Formata uma data no padrão dd/MM/yyyy (ou outro `pattern` fornecido).
 * Aceita Date, string ISO ou timestamp numérico.
 */
export function formatDate(
  date: Date | string | number,
  pattern = "dd/MM/yyyy",
): string {
  const parsed = date instanceof Date ? date : new Date(date);
  return format(parsed, pattern, { locale: LOCALE });
}

/**
 * Formata data e hora no padrão dd/MM/yyyy HH:mm.
 */
export function formatDateTime(date: Date | string | number): string {
  const parsed = date instanceof Date ? date : new Date(date);
  return format(parsed, "dd/MM/yyyy HH:mm", { locale: LOCALE });
}

/**
 * Formata uma data como distância relativa até agora (ex: "há 3 dias").
 */
export function formatRelative(date: Date | string | number): string {
  const parsed = date instanceof Date ? date : new Date(date);
  return formatDistanceToNow(parsed, { locale: LOCALE, addSuffix: true });
}
