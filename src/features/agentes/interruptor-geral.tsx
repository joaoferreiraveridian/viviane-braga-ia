/**
 * Interruptor geral do agente.
 *
 * `core.agente_ia_config.enabled` é o único ponto que decide se o agente
 * atende alguém: com ele em `false`, o flush do cron roda e faz `continue` em
 * tudo. Fica no topo da página de Agentes, acima das abas, porque é a
 * informação mais importante da tela — se estiver desligado, todo o resto
 * (execuções, fila, resumo) explica um passado, não o presente.
 *
 * Deliberadamente NÃO expõe `somente_test_phones` nem telefones de teste: um
 * segundo jeito de meia-desligar o agente é como se cria a dúvida "por que
 * não respondeu?". Um interruptor.
 */
import { useState } from "react";
import { Bot, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface InterruptorGeralProps {
  enabled: boolean | null;
  carregando: boolean;
  onAlterado: () => void;
}

export function InterruptorGeral({ enabled, carregando, onAlterado }: InterruptorGeralProps) {
  const [salvando, setSalvando] = useState(false);

  async function alternar(valor: boolean) {
    if (!supabase) return;
    setSalvando(true);
    const { data, error } = await supabase
      .schema("api")
      .rpc("fn_agente_definir_enabled", { p_enabled: valor });
    setSalvando(false);

    if (error) {
      toast.error("Não foi possível mudar o estado do agente.", { description: error.message });
      return;
    }
    // Recarrega da fonte da verdade em vez de confiar no clique.
    onAlterado();
    toast[data ? "success" : "info"](
      data ? "Agente ligado — passa a atender no WhatsApp." : "Agente desligado — não responde ninguém.",
    );
  }

  if (carregando) return <Skeleton className="h-20 w-full" />;

  const ligado = enabled === true;

  return (
    <Card
      className={cn(
        "flex flex-wrap items-center gap-4 border-l-4 p-4",
        ligado ? "border-l-emerald-500" : "border-l-muted-foreground/40",
      )}
    >
      <Bot className={cn("size-5 shrink-0", ligado ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="font-medium">{ligado ? "Agente ligado" : "Agente desligado"}</p>
        <p className="text-sm text-muted-foreground">
          {ligado
            ? "Está atendendo no WhatsApp automaticamente."
            : "Nenhuma mensagem é respondida enquanto estiver assim."}
        </p>
      </div>

      {ligado && (
        <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          atendendo clientes reais
        </span>
      )}

      <label className="flex cursor-pointer items-center gap-2">
        {salvando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <Switch
          checked={ligado}
          disabled={salvando || enabled === null}
          onCheckedChange={(v) => void alternar(v)}
          aria-label="Ligar ou desligar o agente para todas as conversas"
        />
      </label>
    </Card>
  );
}
