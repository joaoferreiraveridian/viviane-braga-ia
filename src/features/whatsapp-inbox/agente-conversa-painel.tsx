/**
 * Faixa de controle do agente no topo da conversa + painel de execuções ao
 * vivo. É o "controlar e monitorar" pedido: numa olhada dá para saber se a IA
 * responde nesta conversa, se ela está trabalhando agora, e o que cada
 * execução fez.
 *
 * Não é CRM e não tenta ser: nada de etapa, dono, pipeline. Só o agente.
 */
import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Loader2, Play, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAgenteConversa, type ExecucaoDaConversa } from "./use-agente-conversa";

function horaCurta(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function duracao(ms: number | null) {
  if (ms == null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** Custo em dólar por execução é sempre minúsculo — 4 casas mentem menos. */
function custo(usd: number | null) {
  if (usd == null || usd === 0) return null;
  return `US$ ${usd.toFixed(5)}`;
}

const VISUAL_STATUS: Record<string, { rotulo: string; Icone: typeof CircleCheck; classe: string }> = {
  succeeded: { rotulo: "Respondeu", Icone: CircleCheck, classe: "text-emerald-600 dark:text-emerald-400" },
  failed: { rotulo: "Falhou", Icone: CircleAlert, classe: "text-destructive" },
  skipped: { rotulo: "Pulada", Icone: SkipForward, classe: "text-muted-foreground" },
  running: { rotulo: "Respondendo…", Icone: Loader2, classe: "text-blue-600 dark:text-blue-400" },
  pending: { rotulo: "Na fila", Icone: Loader2, classe: "text-muted-foreground" },
};

function LinhaExecucao({ execucao }: { execucao: ExecucaoDaConversa }) {
  const [aberta, setAberta] = useState(false);
  const visual = VISUAL_STATUS[execucao.status] ?? {
    rotulo: execucao.status,
    Icone: CircleAlert,
    classe: "text-muted-foreground",
  };
  const { Icone } = visual;
  const emAndamento = execucao.status === "running" || execucao.status === "pending";

  // A tool `crm` não existe neste projeto (ficou fora de propósito). O modelo
  // ainda a chama porque o system prompt a descreve, e o passo vira erro sem
  // que a execução falhe. Mostrar isso como "ferramenta usada" confunde.
  const ferramentasReais = execucao.ferramentasUsadas.filter((f) => f !== "crm");

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent"
      >
        <Icone className={cn("mt-0.5 size-4 shrink-0", visual.classe, emAndamento && "animate-spin")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("text-xs font-medium", visual.classe)}>{visual.rotulo}</span>
            <span className="tabular text-xs text-muted-foreground">{horaCurta(execucao.createdAt)}</span>
            {duracao(execucao.latencyMs) && (
              <span className="tabular text-xs text-muted-foreground">{duracao(execucao.latencyMs)}</span>
            )}
            {ferramentasReais.map((f) => (
              <Badge key={f} variant="secondary" className="px-1.5 py-0 text-[10px]">
                {f}
              </Badge>
            ))}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {execucao.error ?? execucao.outputText ?? execucao.inputText ?? "—"}
          </span>
        </span>
        {aberta ? (
          <ChevronUp className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {aberta && (
        <dl className="space-y-2 bg-muted/40 px-3 py-2 text-xs">
          <div>
            <dt className="font-medium text-foreground">Recebeu</dt>
            <dd className="whitespace-pre-wrap text-muted-foreground">{execucao.inputText ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-foreground">Respondeu</dt>
            <dd className="whitespace-pre-wrap text-muted-foreground">{execucao.outputText ?? "—"}</dd>
          </div>
          {execucao.error && (
            <div>
              <dt className="font-medium text-destructive">Erro</dt>
              <dd className="whitespace-pre-wrap text-destructive">{execucao.error}</dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
            {execucao.totalSteps != null && <span>{execucao.totalSteps} passos</span>}
            {execucao.totalTokens != null && <span className="tabular">{execucao.totalTokens} tokens</span>}
            {custo(execucao.costUsd) && <span className="tabular">{custo(execucao.costUsd)}</span>}
          </div>
        </dl>
      )}
    </li>
  );
}

export function AgenteConversaPainel({ conversaId }: { conversaId: string }) {
  const { iaAtiva, definirIaAtiva, salvando, execucoes, carregando, erro, rodandoAgora, dispararAgora, disparando } =
    useAgenteConversa(conversaId);
  const [painelAberto, setPainelAberto] = useState(false);

  async function alternar(valor: boolean) {
    try {
      await definirIaAtiva(valor);
      toast.success(
        valor
          ? "IA ligada nesta conversa — atende mesmo com o agente geral desligado."
          : "IA desligada nesta conversa.",
      );
    } catch (e) {
      toast.error("Não foi possível mudar o estado da IA.", {
        description: e instanceof Error ? e.message : "Erro desconhecido.",
      });
    }
  }

  async function disparar() {
    try {
      await dispararAgora();
      setPainelAberto(true); // abre o painel: o operador quer VER o que acontece
      toast.success("Agente disparado nesta conversa.");
    } catch (e) {
      toast.error("Não foi possível disparar o agente.", {
        description: e instanceof Error ? e.message : "Erro desconhecido.",
      });
    }
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-3 px-4 py-2">
        <Bot className="size-4 shrink-0 text-muted-foreground" aria-hidden />

        <label className="flex cursor-pointer items-center gap-2">
          <Switch
            checked={iaAtiva === true}
            disabled={iaAtiva === null || salvando}
            onCheckedChange={(v) => void alternar(v)}
            aria-label="Ligar ou desligar a IA nesta conversa"
          />
          <span className="text-sm">
            {iaAtiva === null ? (
              // Desconhecido != desligado. Se não deu para ler o estado, dizer
              // "não atende" seria inventar um fato sobre produção.
              <span className="text-muted-foreground">Estado da IA indisponível</span>
            ) : iaAtiva === false ? (
              <span className="text-muted-foreground">IA não atende esta conversa</span>
            ) : (
              "IA atendendo"
            )}
          </span>
        </label>

        {rodandoAgora && (
          <span className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            respondendo agora
          </span>
        )}

        {/* Disparo manual: roda o agente NESTA conversa mesmo com o
            interruptor geral desligado. É a forma de testar um lead sem ligar
            o agente para todos. */}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={disparando || rodandoAgora}
          onClick={() => void disparar()}
          title="Faz o agente responder esta conversa agora, mesmo desligado"
        >
          {disparando ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
          ) : (
            <Play className="mr-1 size-3.5" aria-hidden />
          )}
          Disparar IA
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPainelAberto((v) => !v)}
          aria-expanded={painelAberto}
        >
          Execuções
          {execucoes.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
              {execucoes.length}
            </Badge>
          )}
          {painelAberto ? <ChevronUp className="ml-1 size-3.5" /> : <ChevronDown className="ml-1 size-3.5" />}
        </Button>
      </div>

      {painelAberto && (
        <div className="max-h-72 overflow-y-auto border-t border-border">
          {carregando && <p className="p-3 text-xs text-muted-foreground">Carregando execuções…</p>}
          {erro && <p className="p-3 text-xs text-destructive">Não foi possível carregar as execuções: {erro}</p>}
          {!carregando && !erro && execucoes.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              A IA ainda não processou nenhuma mensagem desta conversa.
            </p>
          )}
          <ul>
            {execucoes.map((e) => (
              <LinhaExecucao key={e.runId} execucao={e} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
