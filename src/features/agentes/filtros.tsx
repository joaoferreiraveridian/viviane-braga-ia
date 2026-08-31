import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { CalendarRange } from "lucide-react";

import { cn } from "@/lib/utils";
import { proximoIntervalo } from "./shared/intervalo-calendario";
import { Calendar } from "./shared/calendar";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { DATA_MINIMA_IA, formatarIntervaloPeriodoIa, PRESETS_PERIODO_IA, periodoIaPersonalizado } from "./format";
import type { FiltrosExecucao, PeriodoIa } from "./types";
import { opcoesStatusExecucao } from "./format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface IaFiltrosProps {
  periodo: PeriodoIa;
  onPeriodoChange: (periodo: PeriodoIa) => void;
  apenasErros: boolean;
  onApenasErrosChange: (valor: boolean) => void;
  filtros: FiltrosExecucao;
  onFiltrosChange: (filtros: FiltrosExecucao) => void;
  /** Ferramentas que o agente realmente tem — alimenta o seletor. */
  ferramentasDisponiveis: string[];
}

/**
 * Filtro de período (presets + calendário de intervalo livre, mesmo desenho
 * de `financeiro-filtros.tsx`/`dashboard-filtros.tsx`, duplicado aqui
 * deliberadamente) + o alternador "somente erros" que `fn_agente_execucao_lista`
 * aceita como `p_apenas_erros`. Sticky acima das abas de execução —
 * o recorte aplicado precisa ficar visível o tempo todo.
 */
export function IaFiltros({
  periodo,
  onPeriodoChange,
  apenasErros,
  onApenasErrosChange,
  filtros,
  onFiltrosChange,
  ferramentasDisponiveis,
}: IaFiltrosProps) {
  // A busca é digitada, então tem debounce: sem isso sai uma consulta por
  // tecla. 350ms é o ponto em que parece instantâneo e ainda agrupa a digitação.
  const [buscaLocal, setBuscaLocal] = useState(filtros.busca);
  useEffect(() => setBuscaLocal(filtros.busca), [filtros.busca]);
  useEffect(() => {
    if (buscaLocal === filtros.busca) return;
    const t = setTimeout(() => onFiltrosChange({ ...filtros, busca: buscaLocal }), 350);
    return () => clearTimeout(t);
  }, [buscaLocal, filtros, onFiltrosChange]);

  function alternarStatus(valor: string) {
    const jaTem = filtros.status.includes(valor);
    onFiltrosChange({
      ...filtros,
      status: jaTem ? filtros.status.filter((s) => s !== valor) : [...filtros.status, valor],
    });
  }

  const temFiltro =
    filtros.status.length > 0 || filtros.busca.trim() !== "" || filtros.ferramenta !== null || apenasErros;

  const [abertoPersonalizado, setAbertoPersonalizado] = useState(false);
  const [rangePendente, setRangePendente] = useState<DateRange | undefined>({ from: periodo.inicio, to: periodo.fim });

  const agora = new Date();

  function handleAbrirPersonalizado(aberto: boolean) {
    if (aberto) setRangePendente({ from: periodo.inicio, to: periodo.fim });
    setAbertoPersonalizado(aberto);
  }

  function handleSelecionarRange(_range: DateRange | undefined, triggerDate: Date) {
    // O intervalo calculado pelo react-day-picker é ignorado de propósito:
    // quem decide é `proximoIntervalo`, único caminho que aceita um dia
    // único (clicar duas vezes no mesmo dia) e que reinicia a seleção quando
    // o calendário reabre com o intervalo já aplicado marcado.
    const proximo = proximoIntervalo(rangePendente, triggerDate);
    setRangePendente(proximo);
    if (proximo.from && proximo.to) {
      onPeriodoChange(periodoIaPersonalizado(proximo.from, proximo.to));
      setAbertoPersonalizado(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-base text-foreground">Período</h2>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm">
          <CalendarRange className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="tabular font-medium text-foreground">{formatarIntervaloPeriodoIa(periodo)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS_PERIODO_IA.map((preset) => (
            <button
              key={preset.id}
              type="button"
              aria-pressed={periodo.presetId === preset.id}
              onClick={() => onPeriodoChange({ ...preset.calcular(agora), presetId: preset.id })}
              className={cn(
                "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
                periodo.presetId === preset.id
                  ? "border-foreground/60 bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}

          <Popover open={abertoPersonalizado} onOpenChange={handleAbrirPersonalizado}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-pressed={periodo.presetId === "personalizado"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  periodo.presetId === "personalizado"
                    ? "border-foreground/60 bg-accent text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                <CalendarRange className="size-3.5 shrink-0" aria-hidden />
                Personalizado
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto" align="start">
              <Calendar
                mode="range"
                numberOfMonths={2}
                captionLayout="dropdown"
                startMonth={new Date(DATA_MINIMA_IA.getFullYear() - 1, 0, 1)}
                endMonth={new Date(agora.getFullYear(), agora.getMonth(), 1)}
                disabled={{ after: agora }}
                selected={rangePendente}
                onSelect={handleSelecionarRange}
              />
              <p className="mt-2 max-w-[22rem] text-[11px] text-muted-foreground">
                Escolha a data de início e a data de fim. O filtro aplica assim que as duas estiverem marcadas.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3 sm:border-t-0 sm:pt-0">
          <Switch id="ia-apenas-erros" checked={apenasErros} onCheckedChange={onApenasErrosChange} />
          <Label htmlFor="ia-apenas-erros" className="cursor-pointer text-xs font-medium text-muted-foreground">
            Somente erros
          </Label>
        </div>
      </div>

      {/* Segunda faixa: o que aconteceu, com quem, usando o quê. O período
          responde "quando" e fica em cima; estes três respondem "o quê". */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          {opcoesStatusExecucao().map((opcao) => {
            const marcado = filtros.status.includes(opcao.valor);
            return (
              <button
                key={opcao.valor}
                type="button"
                aria-pressed={marcado}
                onClick={() => alternarStatus(opcao.valor)}
                className={cn(
                  "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
                  marcado
                    ? "border-foreground/60 bg-accent text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {opcao.rotulo}
              </button>
            );
          })}
        </div>

        {ferramentasDisponiveis.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Ferramenta</span>
            {ferramentasDisponiveis.map((f) => {
              const marcada = filtros.ferramenta === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => onFiltrosChange({ ...filtros, ferramenta: marcada ? null : f })}
                  className={cn(
                    "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
                    marcada
                      ? "border-foreground/60 bg-accent text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              );
            })}
          </div>
        )}

        <div className="relative ml-auto min-w-[16rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={buscaLocal}
            onChange={(e) => setBuscaLocal(e.target.value)}
            placeholder="Nome, telefone ou trecho da mensagem"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {temFiltro && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              onFiltrosChange({ status: [], busca: "", ferramenta: null });
              onApenasErrosChange(false);
            }}
          >
            <X className="mr-1 size-3.5" aria-hidden />
            Limpar
          </Button>
        )}
      </div>
    </Card>
  );
}
