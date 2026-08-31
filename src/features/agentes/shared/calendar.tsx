import * as React from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DropdownProps } from "react-day-picker";
import { ptBR } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Substitui o `<select>` nativo que o `react-day-picker` usa por padrão nos
 * dropdowns de mês/ano (`captionLayout="dropdown"`) pelo `Select` do design
 * system (Radix). Regra do CTO em 30/07/2026: zero controle nativo do
 * navegador, sem exceção — nem escondido dentro de uma biblioteca de
 * terceiros.
 */
function CalendarDropdown({ value, onChange, options }: DropdownProps) {
  const handleChange = (valor: string) => {
    // `react-day-picker` espera um ChangeEvent de <select> de verdade — o
    // Select do design system só devolve a string do valor selecionado.
    // Construímos o formato mínimo que o handler interno da biblioteca lê
    // (`event.target.value`) em vez de reimplementar a navegação de mês/ano.
    onChange?.({ target: { value: valor } } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <Select value={String(value)} onValueChange={handleChange}>
      <SelectTrigger className="h-7 w-auto min-w-[4.5rem] gap-1 px-2 py-1 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {options?.map((opcao) => (
          <SelectItem key={opcao.value} value={String(opcao.value)} disabled={opcao.disabled}>
            {opcao.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CalendarChevron({ orientation, className }: { orientation?: "up" | "down" | "left" | "right"; className?: string }) {
  if (orientation === "left") return <ChevronLeft className={cn("size-4", className)} aria-hidden />;
  if (orientation === "up" || orientation === "down") return <ChevronDown className={cn("size-3.5", className)} aria-hidden />;
  return <ChevronRight className={cn("size-4", className)} aria-hidden />;
}

/**
 * Calendário do design system, sobre `react-day-picker` — a mesma decisão de
 * arquitetura do `select.tsx`: consumir a biblioteca Radix/headless
 * correspondente e estilizar 100% com os tokens do projeto, sem importar o
 * CSS padrão da biblioteca (que traz cor hardcoded) e sem deixar nenhum
 * `<select>`/controle nativo escapar (ver `CalendarDropdown` acima).
 *
 * Todas as classes abaixo mapeiam as chaves de `getDefaultClassNames()` do
 * react-day-picker v9 para as classes Tailwind/tokens equivalentes deste
 * projeto (mesma paleta usada em `select.tsx`/`data-table.tsx`).
 *
 * `locale` é `ptBR` por padrão — regra permanente da plataforma, todo
 * calendário é em português (dias da semana, nomes de mês, domingo como
 * primeiro dia). Uma tela específica ainda pode sobrescrever passando sua
 * própria prop `locale`, se algum dia precisar.
 */
function Calendar({ className, classNames, showOutsideDays = true, locale = ptBR, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={locale}
      className={cn("p-0", className)}
      classNames={{
        root: "text-foreground",
        months: "flex flex-col gap-4 sm:flex-row",
        month: "flex flex-col gap-3",
        month_caption: "flex items-center justify-center pt-1",
        caption_label: "text-sm font-medium text-foreground",
        dropdowns: "flex items-center gap-1.5",
        nav: "flex items-center gap-1 absolute inset-x-0 top-0 justify-between px-0",
        button_previous: cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        ),
        button_next: cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        ),
        month_grid: "mt-2 w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-center text-[11px] font-medium text-muted-foreground",
        weeks: "flex flex-col gap-0.5",
        week: "flex",
        day: "p-0 text-center",
        day_button:
          "inline-flex size-8 items-center justify-center rounded-md text-xs text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        today: "font-medium text-foreground [&>button]:border [&>button]:border-border",
        selected: "",
        range_start: "[&>button]:rounded-r-none [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90",
        range_end: "[&>button]:rounded-l-none [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary/90",
        range_middle: "[&>button]:rounded-none [&>button]:bg-accent [&>button]:text-accent-foreground",
        outside: "text-muted-foreground/40",
        disabled: "text-muted-foreground/30 line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: CalendarChevron,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
