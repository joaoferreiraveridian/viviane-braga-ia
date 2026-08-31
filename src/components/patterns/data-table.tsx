import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { LoadingState } from "@/components/patterns/loading-state";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  /** Chave única da coluna. Não precisa corresponder a uma propriedade de T. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
  sortable?: boolean;
  /** Valor usado para ordenar quando `sortable` é true. Padrão: `render`. */
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectedKeysChange?: (keys: Set<string>) => void;
  pageSize?: number;
  className?: string;
}

type SortDirection = "asc" | "desc";

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/**
 * Tabela genérica de dados: colunas declarativas, ordenação client-side,
 * seleção opcional, paginação simples e os 4 estados (loading / error /
 * empty / com dados). Construída sobre o primitive `table`, sem
 * dependência de @tanstack/react-table.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  error,
  onRetry,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription = "Ajuste os filtros ou tente novamente mais tarde.",
  onRowClick,
  selectable = false,
  selectedKeys,
  onSelectedKeysChange,
  pageSize = 10,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sort) return data;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return data;
    const getValue = column.sortValue ?? ((row: T) => String(column.render(row)));

    return [...data].sort((a, b) => {
      const valueA = getValue(a);
      const valueB = getValue(b);
      const comparison =
        typeof valueA === "number" && typeof valueB === "number"
          ? valueA - valueB
          : String(valueA).localeCompare(String(valueB), "pt-BR");
      return sort.direction === "asc" ? comparison : -comparison;
    });
  }, [data, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageData = useMemo(
    () => sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [sortedData, currentPage, pageSize],
  );

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortable) return;
    setSort((previous) => {
      if (!previous || previous.key !== column.key) {
        return { key: column.key, direction: "asc" };
      }
      if (previous.direction === "asc") return { key: column.key, direction: "desc" };
      return null;
    });
  }

  function toggleRow(key: string) {
    if (!selectedKeys || !onSelectedKeysChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedKeysChange(next);
  }

  function togglePage() {
    if (!selectedKeys || !onSelectedKeysChange) return;
    const pageKeys = pageData.map(rowKey);
    const allSelected = pageKeys.every((key) => selectedKeys.has(key));
    const next = new Set(selectedKeys);
    if (allSelected) pageKeys.forEach((key) => next.delete(key));
    else pageKeys.forEach((key) => next.add(key));
    onSelectedKeysChange(next);
  }

  if (loading) {
    return <LoadingState rows={pageSize} className={className} />;
  }

  if (error) {
    return <ErrorState onRetry={onRetry} className={className} />;
  }

  if (data.length === 0) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} className={className} />
    );
  }

  const pageKeys = pageData.map(rowKey);
  const allPageSelected =
    selectable && selectedKeys ? pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key)) : false;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={togglePage}
                    aria-label="Selecionar todos os itens desta página"
                  />
                </TableHead>
              )}
              {columns.map((column) => {
                const isActive = sort?.key === column.key;
                const SortIcon = isActive
                  ? sort?.direction === "asc"
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;

                return (
                  <TableHead
                    key={column.key}
                    style={{ width: column.width }}
                    className={cn(ALIGN_CLASS[column.align ?? "left"])}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {column.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row) => {
              const key = rowKey(row);
              return (
                <TableRow
                  key={key}
                  data-state={selectedKeys?.has(key) ? "selected" : undefined}
                  className={cn(onRowClick && "cursor-pointer")}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selectedKeys?.has(key) ?? false}
                        onCheckedChange={() => toggleRow(key)}
                        aria-label="Selecionar linha"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={cn(ALIGN_CLASS[column.align ?? "left"])}
                    >
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2">
          <p className="tabular text-xs text-muted-foreground">
            Página {currentPage} de {pageCount}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
