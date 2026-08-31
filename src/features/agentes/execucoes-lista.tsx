import { Bot, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "./shared/data-table";
import { EmptyState } from "./shared/empty-state";
import { formatarTelefone, resolverIdentidadePessoa } from "./shared/format";
import { InboxErro } from "./shared/erro";
import {
  formatarCustoUsd,
  formatarDataHora,
  formatarLatencia,
  formatarTokens,
  rotuloStatusExecucao,
  varianteStatusExecucao,
} from "./format";
import type { ExecucaoItem } from "./types";

interface IaExecucoesListaProps {
  itens: ExecucaoItem[];
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  execucaoSelecionadaId: string | null;
  onSelecionar: (execucao: ExecucaoItem) => void;
  /** `true` quando o resumo do período confirma zero execuções — a lista distingue esse caso ("nada aconteceu neste recorte") de um erro de rede. */
  periodoSemExecucoes: boolean;
}

/**
 * Lista das execuções do agente (`fn_agente_execucao_lista`) — uma linha por
 * `run_id`, com o suficiente para triagem visual sem abrir o detalhe: lead,
 * status, modelo, ferramentas usadas, passos, latência, custo e criado em.
 * Selecionar uma linha abre o painel de detalhe ao lado
 * (`ia-execucao-detalhe.tsx`) com a timeline completa de passos.
 */
export function IaExecucoesLista({
  itens,
  carregando,
  erro,
  onTentarDeNovo,
  execucaoSelecionadaId,
  onSelecionar,
  periodoSemExecucoes,
}: IaExecucoesListaProps) {
  if (erro) {
    return (
      <InboxErro
        titulo="Não deu para carregar as execuções"
        descricao="A consulta a fn_agente_execucao_lista falhou — pode ter sido uma instabilidade de rede. Tentar de novo costuma resolver."
        onTentarDeNovo={onTentarDeNovo}
      />
    );
  }

  if (!carregando && periodoSemExecucoes) {
    return (
      <Card className="p-0">
        <EmptyState
          className="border-none bg-transparent"
          icone={Bot}
          titulo="Nenhuma execução neste período"
          descricao="fn_agente_execucao_resumo confirma zero execuções no recorte de datas escolhido — o agente comercial não processou nenhuma mensagem nesta janela."
          proximoPasso='Ampliar o período (ex.: trocar para "Tudo") ou aguardar novas conversas no WhatsApp comercial.'
        />
      </Card>
    );
  }

  const colunas: DataTableColumn<ExecucaoItem>[] = [
    {
      key: "lead",
      header: "Lead",
      render: (item) => {
        const identidade = resolverIdentidadePessoa(item.leadNome, item.leadTelefone);
        const selecionado = item.runId === execucaoSelecionadaId;
        return (
          <button type="button" onClick={() => onSelecionar(item)} className="flex flex-col items-start text-left">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-medium hover:underline",
                identidade.tipo === "telefone" && "tabular",
                selecionado ? "text-foreground" : "text-foreground/90",
              )}
            >
              {selecionado && <Check className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
              {identidade.texto}
            </span>
            {identidade.tipo !== "telefone" && item.leadTelefone && (
              <span className="tabular text-xs text-muted-foreground">{formatarTelefone(item.leadTelefone)}</span>
            )}
          </button>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (item) => (
        <div className="flex flex-col gap-1">
          <Badge variant={varianteStatusExecucao(item.status)}>{rotuloStatusExecucao(item.status)}</Badge>
          {item.status === "failed" && item.error && (
            <span className="max-w-[16rem] truncate text-[11px] text-destructive" title={item.error}>
              {item.error}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "model",
      header: "Modelo",
      render: (item) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm text-foreground" title={item.model ?? undefined}>
            {item.model ?? "—"}
          </span>
          {item.provider && <span className="truncate text-[11px] text-muted-foreground">{item.provider}</span>}
        </div>
      ),
    },
    {
      key: "ferramentas",
      header: "Ferramentas",
      render: (item) =>
        item.ferramentasUsadas.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.ferramentasUsadas.map((nome) => (
              <Badge key={nome} variant="outline">
                {nome}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">nenhuma</span>
        ),
    },
    {
      key: "passos",
      header: "Passos",
      numeric: true,
      className: "truncate",
      render: (item) => <span className="tabular">{item.totalSteps ?? "—"}</span>,
    },
    {
      key: "latencia",
      header: "Latência",
      numeric: true,
      className: "truncate",
      render: (item) => <span className="tabular">{formatarLatencia(item.latencyMs)}</span>,
    },
    {
      key: "custo",
      header: "Custo",
      numeric: true,
      className: "truncate",
      render: (item) => <span className="tabular">{formatarCustoUsd(item.costUsd)}</span>,
    },
    {
      key: "tokens",
      header: "Tokens",
      numeric: true,
      className: "truncate",
      render: (item) => <span className="tabular">{formatarTokens(item.totalTokens)}</span>,
    },
    {
      key: "criado_em",
      header: "Criado em",
      className: "truncate",
      render: (item) => <span className="tabular text-xs text-muted-foreground">{formatarDataHora(item.createdAt)}</span>,
    },
  ];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-base text-foreground">Execuções</h2>
        <span className="tabular text-xs text-muted-foreground">{carregando ? "..." : `${itens.length} execução(ões)`}</span>
      </div>
      <DataTable
        columns={colunas}
        data={itens}
        getRowId={(i) => i.runId}
        carregando={carregando}
        colGroup={
          <colgroup>
            <col style={{ width: "15%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
        }
        vazio={
          <EmptyState
            className="m-4 border-none bg-transparent"
            icone={Bot}
            titulo="Nenhuma execução encontrada"
            descricao="fn_agente_execucao_lista não devolveu nenhuma linha para este recorte e este filtro (período e/ou somente erros)."
            proximoPasso='Ajustar o período ou desligar o filtro "Somente erros".'
          />
        }
      />
    </Card>
  );
}
