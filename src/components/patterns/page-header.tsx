import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

export interface PageHeaderBreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: PageHeaderBreadcrumbItem[];
  actions?: ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão de tela: breadcrumb opcional, título, descrição
 * opcional e um slot de ações à direita (botões, filtros rápidos etc).
 */
export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 pb-6", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumb.map((item, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <li key={`${item.label}-${index}`} className="flex items-center gap-1">
                  {item.to && !isLast ? (
                    <Link to={item.to} className="hover:text-foreground">
                      {item.label}
                    </Link>
                  ) : (
                    <span className={cn(isLast && "text-foreground")}>{item.label}</span>
                  )}
                  {!isLast && (
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold text-foreground">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
