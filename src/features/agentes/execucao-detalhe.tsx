import { useState } from "react";
import { AlertTriangle, Bot, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { InboxErro } from "./shared/erro";
import {
  formatarCustoUsd,
  formatarDataHora,
  formatarLatencia,
  formatarTokens,
  iconeStepTipo,
  jsonFormatado,
  resumirJson,
  rotuloStatusExecucao,
  rotuloStepTipo,
  varianteStatusExecucao,
} from "./format";
import { formatarTelefone, resolverIdentidadePessoa } from "./shared/format";
import type { ExecucaoItem, ExecucaoPasso } from "./types";

interface IaExecucaoDetalheProps {
  execucao: ExecucaoItem | null;
  passos: ExecucaoPasso[];
  carregandoPassos: boolean;
  erroPassos: boolean;
  onTentarDeNovoPassos: () => void;
}

function BlocoJson({ rotulo, valor }: { rotulo: string; valor: unknown }) {
  const [expandido, setExpandido] = useState(false);
  if (valor === null || valor === undefined) {
    return (
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{rotulo}:</span> —
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-xs">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="inline-flex items-center gap-1 text-left font-medium text-foreground hover:underline"
      >
        {expandido ? <ChevronDown className="size-3 shrink-0" aria-hidden /> : <ChevronRight className="size-3 shrink-0" aria-hidden />}
        {rotulo}
      </button>
      {!expandido && <span className="pl-4 text-muted-foreground">{resumirJson(valor)}</span>}
      {expandido && (
        <pre className="ml-4 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] text-foreground">
          {jsonFormatado(valor)}
        </pre>
      )}
    </div>
  );
}

/**
 * Painel de detalhe de uma execução: o que o lead disse, o que a IA
 * respondeu, métricas (tokens/custo/latência/finish_reason), erro quando
 * houver, e a timeline completa de passos (`vw_agente_execucao_passo`) — ícone
 * distinto por `step_type`, ferramenta usada quando houver, e o
 * input/output jsonb resumido com opção de expandir o JSON cru.
 */
export function IaExecucaoDetalhe({ execucao, passos, carregandoPassos, erroPassos, onTentarDeNovoPassos }: IaExecucaoDetalheProps) {
  if (!execucao) {
    return (
      <div className="flex h-full min-h-[16rem] flex-col items-center justify-center rounded-lg border border-border px-4 text-center">
        <Bot className="mb-2 size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">Selecione uma execução na lista para ver o detalhe e a timeline de passos.</p>
      </div>
    );
  }

  const identidade = resolverIdentidadePessoa(execucao.leadNome, execucao.leadTelefone);

  return (
    <div className="flex h-full min-h-[16rem] flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate font-serif text-base text-foreground">{identidade.texto}</h3>
          <Badge variant={varianteStatusExecucao(execucao.status)}>{rotuloStatusExecucao(execucao.status)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {execucao.leadTelefone && <span className="tabular">{formatarTelefone(execucao.leadTelefone)}</span>}
          <span>·</span>
          <span>{execucao.model ?? "modelo desconhecido"}</span>
          <span>·</span>
          <span className="tabular">Criado em {formatarDataHora(execucao.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">O lead disse</h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-sm text-foreground">
            {execucao.inputText ?? "—"}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A IA respondeu</h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-sm text-foreground">
            {execucao.outputText ?? "—"}
          </p>
        </div>

        {execucao.error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {/* item 11 (12/08): a mensagem original vem crua do provedor (OpenRouter/timeout) — não
                  traduzimos, mas deixamos claro que é técnica/em inglês, não uma notificação nossa. */}
              <span className="font-medium">Erro técnico (mensagem original do provedor): </span>
              {execucao.error}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Motivo de encerramento</span>
            <span className="text-foreground">{execucao.finishReason ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Tokens (prompt/completion/total)</span>
            <span className="tabular text-foreground">
              {formatarTokens(execucao.promptTokens)} / {formatarTokens(execucao.completionTokens)} / {formatarTokens(execucao.totalTokens)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Custo</span>
            <span className="tabular text-foreground">{formatarCustoUsd(execucao.costUsd)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Latência</span>
            <span className="tabular text-foreground">{formatarLatencia(execucao.latencyMs)}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Partes enviadas</span>
            <span className="tabular text-foreground">{execucao.partesEnviadas ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">Passos</span>
            <span className="tabular text-foreground">{execucao.totalSteps ?? "—"}</span>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Timeline de passos</h4>

          {erroPassos && (
            <InboxErro
              titulo="Não deu para carregar os passos"
              descricao="A consulta a vw_agente_execucao_passo falhou — pode ter sido uma instabilidade de rede."
              onTentarDeNovo={onTentarDeNovoPassos}
              className="px-4 py-6"
            />
          )}

          {carregandoPassos && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}

          {!carregandoPassos && !erroPassos && passos.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
              vw_agente_execucao_passo não devolveu nenhum passo para esta execução.
            </p>
          )}

          {!carregandoPassos && !erroPassos && passos.length > 0 && (
            <ol className="flex flex-col gap-3 border-l border-border pl-4">
              {passos.map((passo) => {
                const Icone = iconeStepTipo(passo.stepType);
                const ehErro = passo.stepType === "error" || Boolean(passo.error);
                return (
                  <li key={passo.passoId} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[1.4rem] flex size-5 items-center justify-center rounded-full border bg-background",
                        ehErro ? "border-destructive text-destructive" : "border-border text-muted-foreground",
                      )}
                    >
                      <Icone className="size-3" aria-hidden />
                    </span>
                    <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular text-[11px] text-muted-foreground">#{passo.stepIndex}</span>
                          <span className="text-xs font-medium text-foreground">{rotuloStepTipo(passo.stepType)}</span>
                          {passo.toolName && <Badge variant="outline">{passo.toolName}</Badge>}
                        </div>
                        <span className="tabular text-[11px] text-muted-foreground">{formatarDataHora(passo.createdAt)}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="tabular">Latência: {formatarLatencia(passo.latencyMs)}</span>
                        <span className="tabular">Tokens: {formatarTokens(passo.tokens)}</span>
                      </div>

                      {passo.error && (
                        <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                          <span>{passo.error}</span>
                        </div>
                      )}

                      <BlocoJson rotulo="input" valor={passo.input} />
                      <BlocoJson rotulo="output" valor={passo.output} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
