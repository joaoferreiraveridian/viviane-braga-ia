import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  rows?: number;
  className?: string;
}

/**
 * Estado de carregamento genérico em forma de linhas de esqueleto.
 * Uso típico: corpo de uma lista/tabela enquanto uma query está pendente.
 */
export function LoadingState({ rows = 4, className }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col gap-3 py-2", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
