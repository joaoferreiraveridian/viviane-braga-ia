import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface InboxErroProps {
  titulo: string;
  descricao: string;
  onTentarDeNovo: () => void;
  className?: string;
}

/**
 * Estado de erro de rede/consulta, local ao módulo de Inbox. Deliberadamente
 * distinto de EmptyState: aquele primitivo é para "ainda não há dado" (nunca
 * cor de alarme); isto aqui é para "a consulta falhou", com a cor de erro e
 * uma ação de tentar de novo — os dois não podem se confundir na tela.
 */
export function InboxErro({ titulo, descricao, onTentarDeNovo, className }: InboxErroProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-md bg-destructive/15 text-destructive">
        <AlertTriangle className="size-5" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-serif text-lg text-foreground">{titulo}</p>
        <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onTentarDeNovo}>
        Tentar de novo
      </Button>
    </div>
  );
}
