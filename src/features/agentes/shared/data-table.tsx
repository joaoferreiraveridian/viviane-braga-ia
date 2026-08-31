import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Colunas numéricas ganham alinhamento à direita e fonte tabular automaticamente. */
  numeric?: boolean;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSortChange?: (key: string) => void;
  /** Estado de carregamento: desenha linhas de skeleton com a mesma estrutura de colunas, para não pular layout quando o dado chegar. */
  carregando?: boolean;
  linhasCarregando?: number;
  /** Renderizado no lugar do corpo quando data está vazio e não está carregando. Normalmente um <EmptyState />. */
  vazio?: ReactNode;
  /** Quando presente, a linha inteira vira clicável (cursor-pointer + hover mais forte) e chama este handler com a linha correspondente — usado por telas que abrem um painel de detalhe ao clicar. Opcional: sem ele, o comportamento de linha é exatamente o de antes. */
  onRowClick?: (row: T) => void;
  className?: string;
  /**
   * `<colgroup>` opcional, renderizado como primeiro filho de `<table>`.
   * `Table` já é `table-fixed` por padrão (regra permanente: nenhuma tabela
   * da plataforma rola horizontalmente — ver CLAUDE.md); sem `colGroup`, o
   * navegador reparte as colunas em partes iguais. Passe `colGroup` só
   * quando o conteúdo pede proporção diferente (ex.: "Pessoa" precisa de
   * mais espaço que "Toque") — não para "ativar" o layout fixo, que já é o
   * padrão.
   */
  colGroup?: ReactNode;
}

/**
 * Tabela densa e ordenável, com números tabulares obrigatórios em toda
 * coluna numérica. É o primitivo que toda tela de dado real da plataforma
 * usa.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  sortKey,
  sortDirection = "asc",
  onSortChange,
  carregando,
  linhasCarregando = 5,
  vazio,
  onRowClick,
  className,
  colGroup,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <Table>
        {colGroup}
        <TableHeader>
          <TableRow className="bg-muted/40">
            {columns.map((coluna) => {
              const ativa = sortKey === coluna.key;
              const podeOrdenar = coluna.sortable && onSortChange;
              const IconeOrdenacao = !ativa ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
              // aria-sort só faz sentido em coluna ordenável; nas outras, "none"
              // declara explicitamente "esta coluna não ordena" em vez de
              // omitir o atributo (leitor de tela nunca precisa adivinhar).
              const ariaSort: "none" | "ascending" | "descending" | undefined = !coluna.sortable
                ? undefined
                : !ativa
                  ? "none"
                  : sortDirection === "asc"
                    ? "ascending"
                    : "descending";

              return (
                <TableHead
                  key={coluna.key}
                  scope="col"
                  aria-sort={ariaSort}
                  className={coluna.numeric ? "text-right" : "text-left"}
                >
                  {podeOrdenar ? (
                    <button
                      type="button"
                      onClick={() => onSortChange?.(coluna.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        ativa && "text-foreground",
                      )}
                    >
                      {coluna.header}
                      <IconeOrdenacao className="size-3" aria-hidden />
                    </button>
                  ) : (
                    coluna.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {carregando &&
            Array.from({ length: linhasCarregando }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                {columns.map((coluna) => (
                  <TableCell key={coluna.key}>
                    <Skeleton className="h-4 w-full max-w-[10rem]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}

          {!carregando && data.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                {vazio}
              </TableCell>
            </TableRow>
          )}

          {!carregando &&
            data.map((row) => (
              <TableRow
                key={getRowId(row)}
                className={cn("hover:bg-muted/30", onRowClick && "cursor-pointer hover:bg-muted/50")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((coluna) => (
                  <TableCell
                    key={coluna.key}
                    className={cn(coluna.numeric && "text-right tabular", coluna.className)}
                  >
                    {coluna.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );
}
