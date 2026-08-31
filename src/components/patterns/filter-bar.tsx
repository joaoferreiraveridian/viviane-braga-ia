import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string | undefined>;
  onChange: (key: string, value: string | undefined) => void;
  onClearAll: () => void;
  className?: string;
}

const ALL_VALUE = "__all__";

/**
 * Barra de filtros: um Select (nunca `<select>` nativo) por filtro
 * configurado, chips com os filtros ativos e um botão de "limpar tudo"
 * que só aparece quando há algo para limpar.
 */
export function FilterBar({ filters, values, onChange, onClearAll, className }: FilterBarProps) {
  const activeEntries = filters
    .map((filter) => {
      const activeValue = values[filter.key];
      if (!activeValue) return null;
      const option = filter.options.find((item) => item.value === activeValue);
      if (!option) return null;
      return { filter, option };
    })
    .filter((entry): entry is { filter: FilterConfig; option: FilterOption } => entry !== null);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <Select
            key={filter.key}
            value={values[filter.key] ?? ALL_VALUE}
            onValueChange={(value) =>
              onChange(filter.key, value === ALL_VALUE ? undefined : value)
            }
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>{filter.label} (todos)</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {activeEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeEntries.map(({ filter, option }) => (
            <Badge key={filter.key} variant="secondary" className="gap-1 pr-1">
              <span>
                {filter.label}: {option.label}
              </span>
              <button
                type="button"
                onClick={() => onChange(filter.key, undefined)}
                className="rounded-sm p-0.5 hover:bg-background/60"
                aria-label={`Remover filtro ${filter.label}`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 px-2 text-xs">
            Limpar tudo
          </Button>
        </div>
      )}
    </div>
  );
}
