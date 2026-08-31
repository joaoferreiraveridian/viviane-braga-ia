import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRecencia } from "./recencia";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface RecencyBadgeProps {
  /** Data ISO do momento em que o valor foi calculado/ingerido. */
  atualizadoEm: string;
  className?: string;
  /**
   * Explicação curta opcional, exibida no tooltip abaixo do horário absoluto
   * — para os casos em que "atualizado há X" sozinho não basta (ex.: o dado
   * vem de uma materialized view recalculada por job periódico, não em tempo
   * real). Adicionado em 08/08/2026, retrocompatível: ausente, o tooltip
   * continua mostrando só o horário absoluto, comportamento idêntico ao
   * anterior — nenhum consumidor existente precisa mudar.
   */
  explicacao?: string;
  /**
   * Palavra antes do tempo relativo — "atualizado" por padrão. Trocar quando
   * o timestamp não é uma atualização (ex.: "entrou", "cadastrado"), para o
   * selo nunca contradizer o cabeçalho da coluna onde ele aparece.
   */
  prefixo?: string;
}

/**
 * Selo de recência. "Atualizado há X" ao lado de qualquer valor — dado
 * velho apresentado como fresco é pior do que dado ausente (regra de
 * dashboard da skill vrc-design). O timestamp absoluto fica no tooltip
 * para quem precisa da hora exata; `explicacao`, quando presente, entra
 * logo abaixo dele.
 */
export function RecencyBadge({ atualizadoEm, className, explicacao, prefixo = "atualizado" }: RecencyBadgeProps) {
  const label = formatRecencia(atualizadoEm);
  const absoluto = new Date(atualizadoEm).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground",
            className,
          )}
        >
          <Clock className="size-3" aria-hidden />
          {prefixo} {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex max-w-56 flex-col gap-1">
          <span>{absoluto}</span>
          {explicacao && <span className="text-muted-foreground">{explicacao}</span>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
