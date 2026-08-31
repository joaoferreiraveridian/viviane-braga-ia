import { Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "./shared/data-table";
import { EmptyState } from "./shared/empty-state";
import { formatarTelefone, resolverIdentidadePessoa } from "./shared/format";
import { InboxErro } from "./shared/erro";
import { formatarDataHora } from "./format";
import type { FilaPendenteItem } from "./types";

interface IaFilaPendenteProps {
  itens: FilaPendenteItem[];
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
}

/**
 * Fila de debounce (`api.vw_agente_fila_pendente`) — mensagens que já chegaram
 * pelo WhatsApp mas ainda não foram processadas pelo agente, porque o
 * debounce configurado (ver aba Configuração) ainda não expirou. Não é uma
 * lista de execuções: é o que está prestes a virar uma.
 */
export function IaFilaPendente({ itens, carregando, erro, onTentarDeNovo }: IaFilaPendenteProps) {
  if (erro) {
    return (
      <InboxErro
        titulo="Não deu para carregar a fila pendente"
        descricao="A consulta a vw_agente_fila_pendente falhou — pode ter sido uma instabilidade de rede. Tentar de novo costuma resolver."
        onTentarDeNovo={onTentarDeNovo}
      />
    );
  }

  const colunas: DataTableColumn<FilaPendenteItem>[] = [
    {
      key: "lead",
      header: "Lead",
      render: (item) => {
        const identidade = resolverIdentidadePessoa(item.leadNome, item.phone);
        return (
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{identidade.texto}</span>
            {identidade.tipo !== "telefone" && item.phone && (
              <span className="tabular text-xs text-muted-foreground">{formatarTelefone(item.phone)}</span>
            )}
          </div>
        );
      },
    },
    {
      key: "conteudo",
      header: "Mensagem",
      className: "max-w-[24rem]",
      render: (item) => <span className="block truncate text-sm text-muted-foreground">{item.content ?? "(sem conteúdo)"}</span>,
    },
    {
      key: "recebido_em",
      header: "Recebido em",
      render: (item) => <span className="tabular text-xs text-muted-foreground">{formatarDataHora(item.receivedAt)}</span>,
    },
    {
      key: "consumido",
      header: "Situação",
      render: (item) =>
        item.consumedAt ? (
          <span className="text-xs text-muted-foreground">Consumida — ver execução</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" aria-hidden />
            Aguardando debounce
          </span>
        ),
    },
  ];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-base text-foreground">Fila pendente</h2>
        <span className="tabular text-xs text-muted-foreground">{carregando ? "..." : `${itens.length} mensagem(ns)`}</span>
      </div>
      <DataTable
        columns={colunas}
        data={itens}
        getRowId={(i) => i.bufferId}
        carregando={carregando}
        vazio={
          <EmptyState
            className="m-4 border-none bg-transparent"
            icone={Clock}
            titulo="Nenhuma mensagem na fila"
            descricao="vw_agente_fila_pendente não devolveu nenhuma linha — não há mensagem aguardando o debounce neste momento."
            proximoPasso="Nenhuma ação aqui — a fila esvazia sozinha assim que o agente processa cada mensagem."
          />
        }
      />
    </Card>
  );
}
