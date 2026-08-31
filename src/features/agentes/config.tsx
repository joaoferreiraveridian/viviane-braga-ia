import { useState } from "react";
import { ChevronDown, ChevronRight, Settings, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./shared/empty-state";
import { RecencyBadge } from "./shared/recency-badge";
import { InboxErro } from "./shared/erro";
import { formatarTelefone } from "./shared/format";
import { jsonFormatado } from "./format";
import type { AgenteConfig, AgenteTool } from "./types";

interface IaConfigProps {
  config: AgenteConfig | null;
  carregandoConfig: boolean;
  erroConfig: boolean;
  onTentarDeNovoConfig: () => void;

  tools: AgenteTool[];
  carregandoTools: boolean;
  erroTools: boolean;
  onTentarDeNovoTools: () => void;
}

function ToolSchema({ schema }: { schema: unknown }) {
  const [expandido, setExpandido] = useState(false);
  if (schema === null || schema === undefined) {
    return <p className="text-xs text-muted-foreground">Sem schema declarado.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="inline-flex items-center gap-1 text-left text-xs font-medium text-foreground hover:underline"
      >
        {expandido ? <ChevronDown className="size-3 shrink-0" aria-hidden /> : <ChevronRight className="size-3 shrink-0" aria-hidden />}
        Schema
      </button>
      {expandido && (
        <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] text-foreground">
          {jsonFormatado(schema)}
        </pre>
      )}
    </div>
  );
}

/**
 * Aba Configuração — a config ativa do agente comercial (`vw_agente_config`,
 * hoje 1 linha só) e a lista de tools que ele tem disponível
 * (`vw_agente_tool`). Somente leitura: sem campo de edição de prompt nesta
 * rodada, por escopo explícito da tarefa. O `system_prompt` completo vai num
 * bloco rolável, fonte monoespaçada, para o operador auditar exatamente o
 * que o agente recebe — nunca um textarea editável.
 */
export function IaConfig({
  config,
  carregandoConfig,
  erroConfig,
  onTentarDeNovoConfig,
  tools,
  carregandoTools,
  erroTools,
  onTentarDeNovoTools,
}: IaConfigProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-base text-foreground">Configuração ativa</h2>
          {config && <RecencyBadge atualizadoEm={config.updatedAt} />}
        </div>

        {erroConfig && (
          <InboxErro
            titulo="Não deu para carregar a configuração"
            descricao="A consulta a vw_agente_config falhou — pode ter sido uma instabilidade de rede. Tentar de novo costuma resolver."
            onTentarDeNovo={onTentarDeNovoConfig}
          />
        )}

        {carregandoConfig && !erroConfig && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {!carregandoConfig && !erroConfig && !config && (
          <EmptyState
            className="border-none bg-transparent p-0"
            icone={Settings}
            titulo="Nenhuma configuração encontrada"
            descricao="vw_agente_config não devolveu nenhuma linha — o agente comercial ainda não tem configuração publicada neste ambiente."
            proximoPasso="Confirmar com quem opera o agente (n8n/Supabase) se a linha de configuração já foi criada."
          />
        )}

        {!carregandoConfig && !erroConfig && config && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={config.enabled ? "success" : "outline"} className="w-fit">
                  {config.enabled ? "Ativo" : "Desativado"}
                </Badge>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Provedor</span>
                <span className="text-foreground">{config.provider ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Modelo</span>
                <span className="text-foreground">{config.model ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Temperatura</span>
                <span className="tabular text-foreground">{config.temperature ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Debounce</span>
                <span className="tabular text-foreground">{config.debounceSeconds ?? "—"} s</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">Debounce (teste)</span>
                <span className="tabular text-foreground">{config.debounceSecondsTest ?? "—"} s</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Telefones de teste</span>
              {config.testPhones.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {config.testPhones.map((telefone) => (
                    <Badge key={telefone} variant="outline" className="tabular">
                      {formatarTelefone(telefone)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">nenhum</span>
              )}
            </div>

            <Separator />

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prompt do sistema</span>
              <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs leading-relaxed text-foreground">
                {config.systemPrompt ?? "—"}
              </pre>
            </div>
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-base text-foreground">Ferramentas disponíveis</h2>
          <span className="tabular text-xs text-muted-foreground">{carregandoTools ? "..." : `${tools.length} ferramenta(s)`}</span>
        </div>

        {erroTools && (
          <InboxErro
            titulo="Não deu para carregar as ferramentas"
            descricao="A consulta a vw_agente_tool falhou — pode ter sido uma instabilidade de rede. Tentar de novo costuma resolver."
            onTentarDeNovo={onTentarDeNovoTools}
          />
        )}

        {carregandoTools && !erroTools && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!carregandoTools && !erroTools && tools.length === 0 && (
          <EmptyState
            className="border-none bg-transparent p-0"
            icone={Wrench}
            titulo="Nenhuma ferramenta cadastrada"
            descricao="vw_agente_tool não devolveu nenhuma linha — o agente comercial não tem ferramenta declarada neste ambiente."
            proximoPasso="Confirmar com quem opera o agente se as ferramentas já foram cadastradas."
          />
        )}

        {!carregandoTools &&
          !erroTools &&
          tools.length > 0 &&
          tools.map((tool) => (
            <div key={tool.toolId} className={cn("flex flex-col gap-2 rounded-md border border-border p-3")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{tool.name}</span>
                <Badge variant={tool.enabled ? "success" : "outline"}>{tool.enabled ? "Habilitada" : "Desabilitada"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{tool.description ?? "Sem descrição."}</p>
              <ToolSchema schema={tool.schema} />
            </div>
          ))}
      </Card>
    </div>
  );
}
