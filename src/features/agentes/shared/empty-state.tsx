import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateAcao {
  label: string;
  onClick?: () => void;
  href?: string;
}

export interface EmptyStateProps {
  icone: LucideIcon;
  titulo: string;
  /** O que falta para esta tela ter dado — nunca "nenhum resultado", sempre a causa real. */
  descricao: string;
  /** O próximo passo concreto para que a tela deixe de estar vazia. */
  proximoPasso: string;
  acao?: EmptyStateAcao;
  className?: string;
}

/**
 * Estado vazio como componente de primeira classe.
 *
 * A plataforma vai passar semanas com tabelas vazias enquanto a ingestão
 * amadurece — por isso este componente nunca parece erro e nunca mostra
 * "0" ou "sem resultados" como se fosse uma resposta. Ele sempre explica
 * o que falta e qual é o próximo passo, e não usa vermelho, dourado nem
 * qualquer cor de alarme: um módulo vazio é um estágio esperado do projeto,
 * não uma falha.
 */
export function EmptyState({ icone: Icone, titulo, descricao, proximoPasso, acao, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-dashed border-border bg-card/50 px-6 py-10",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icone className="size-5" aria-hidden />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="font-serif text-lg text-foreground">{titulo}</p>
        <p className="max-w-2xl text-sm text-muted-foreground">{descricao}</p>
      </div>

      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        <span>{proximoPasso}</span>
      </div>

      {acao && (
        <a
          href={acao.href ?? "#"}
          onClick={acao.onClick}
          className="text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
        >
          {acao.label}
        </a>
      )}
    </div>
  );
}
