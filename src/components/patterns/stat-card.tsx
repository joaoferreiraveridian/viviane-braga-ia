import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardDelta {
  value: string;
  direction: "up" | "down" | "neutral";
}

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: StatCardDelta;
  loading?: boolean;
  className?: string;
}

const DELTA_STYLES: Record<StatCardDelta["direction"], string> = {
  up: "text-success",
  down: "text-destructive",
  neutral: "text-muted-foreground",
};

const DELTA_ICONS: Record<StatCardDelta["direction"], LucideIcon> = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
};

/**
 * Cartão de indicador (KPI). `value` já deve vir formatado pelo chamador
 * (ver src/lib/format.ts) — este componente só cuida da apresentação e
 * sempre renderiza o valor com a classe `.tabular`.
 */
export function StatCard({ label, value, icon: Icon, delta, loading, className }: StatCardProps) {
  const DeltaIcon = delta ? DELTA_ICONS[delta.direction] : null;

  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>

          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <span className="tabular text-2xl font-semibold text-foreground">{value}</span>
          )}

          {loading ? (
            <Skeleton className="h-4 w-16" />
          ) : (
            delta &&
            DeltaIcon && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  DELTA_STYLES[delta.direction],
                )}
              >
                <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular">{delta.value}</span>
              </span>
            )
          )}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}
