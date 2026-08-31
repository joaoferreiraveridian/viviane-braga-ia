import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Bloco de conteúdo com título e borda — usado para agrupar formulários,
 * listas curtas ou blocos de configuração dentro de uma página.
 */
export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
