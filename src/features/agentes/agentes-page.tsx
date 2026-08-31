import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { periodoIaParaIso, PRESETS_PERIODO_IA } from "./format";
import { IaConfig } from "./config";
import { IaExecucaoDetalhe } from "./execucao-detalhe";
import { IaExecucoesLista } from "./execucoes-lista";
import { IaFilaPendente } from "./fila-pendente";
import { IaFiltros } from "./filtros";
import { InterruptorGeral } from "./interruptor-geral";
import { IaResumo } from "./resumo";
import {
  useIaAgenteConfig,
  useIaExecucaoPassos,
  useIaExecucoes,
  useIaFilaPendente,
  useIaResumo,
  useIaTools,
} from "./use-agentes";
import type { ExecucaoItem, FiltrosExecucao, PeriodoIa } from "./types";

type AbaAgentes = "execucoes" | "configuracao";
type SubAbaExecucoes = "lista" | "fila";

function periodoInicial(): PeriodoIa {
  const preset = PRESETS_PERIODO_IA.find((p) => p.id === "30_dias")!;
  const agora = new Date();
  return { ...preset.calcular(agora), presetId: "30_dias" };
}

/**
 * /agentes — gerência de leitura do agente de IA de WhatsApp.
 *
 * Duas abas, e só:
 *
 * 1. **Execuções** — filtro de período + "somente erros"
 *    (`fn_agente_execucao_lista`/`fn_agente_execucao_resumo`), faixa de
 *    resumo, master/detail (lista + timeline de passos da execução
 *    selecionada, `vw_agente_execucao_passo`), e uma sub-aba com a fila de
 *    mensagens aguardando debounce (`vw_agente_fila_pendente`).
 * 2. **Configuração** — a config ativa do agente (`vw_agente_config`, o
 *    prompt único, somente leitura) e as ferramentas (`vw_agente_tool`).
 *
 * Único caminho de leitura: RPCs/views do schema `api`. Esta página nunca
 * escreve em tabela nem chama edge function.
 */
export function AgentesPage() {
  const [abaAtiva, setAbaAtiva] = useState<AbaAgentes>("execucoes");
  const [subAbaExecucoes, setSubAbaExecucoes] = useState<SubAbaExecucoes>("lista");

  const [periodo, setPeriodo] = useState<PeriodoIa>(periodoInicial);
  const [apenasErros, setApenasErros] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosExecucao>({ status: [], busca: "", ferramenta: null });
  const { desdeIso, ateIso } = periodoIaParaIso(periodo);

  const resumoState = useIaResumo(desdeIso, ateIso);
  const execucoesState = useIaExecucoes(desdeIso, ateIso, apenasErros, filtros);
  const filaState = useIaFilaPendente();
  const configState = useIaAgenteConfig();
  const toolsState = useIaTools();

  // As ferramentas do seletor saem das que o agente REALMENTE tem cadastradas
  // (core.agente_ia_tool), não de lista fixa no código: se alguém ligar ou
  // desligar uma tool na aba Configuração, o filtro acompanha sozinho.
  const ferramentasDisponiveis = useMemo(
    () => toolsState.itens.map((t) => t.name).sort(),
    [toolsState.itens],
  );

  const [runIdSelecionado, setRunIdSelecionado] = useState<string | null>(null);
  const execucaoSelecionada = useMemo<ExecucaoItem | null>(
    () => execucoesState.itens.find((e) => e.runId === runIdSelecionado) ?? null,
    [execucoesState.itens, runIdSelecionado],
  );
  const passosState = useIaExecucaoPassos(runIdSelecionado);

  const periodoSemExecucoes =
    !resumoState.carregando && !resumoState.erro && resumoState.resumo?.totalRuns === 0 && !apenasErros;

  const classeAba = cn(
    "shrink-0 rounded-none border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground",
    "data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
  );

  return (
    <Tabs value={abaAtiva} onValueChange={(valor) => setAbaAtiva(valor as AbaAgentes)} className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-6 flex flex-col gap-1 bg-background px-6 pb-1 pt-0 md:-mx-10 md:px-10">
        <div className="flex flex-col gap-0.5 pt-1">
          <h1 className="font-serif text-xl text-foreground">Agentes</h1>
        </div>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger value="execucoes" className={classeAba}>
            Execuções
          </TabsTrigger>
          <TabsTrigger value="configuracao" className={classeAba}>
            Configuração
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Fora das abas de propósito: o estado do agente vale para a tela
          inteira, não para uma aba. */}
      <InterruptorGeral
        enabled={configState.config?.enabled ?? null}
        carregando={configState.carregando}
        onAlterado={configState.recarregar}
      />

      <TabsContent value="execucoes" className="mt-0 flex flex-col gap-4">
        <IaFiltros
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          apenasErros={apenasErros}
          onApenasErrosChange={setApenasErros}
          filtros={filtros}
          onFiltrosChange={setFiltros}
          ferramentasDisponiveis={ferramentasDisponiveis}
        />

        <IaResumo
          resumo={resumoState.resumo}
          carregando={resumoState.carregando}
          erro={resumoState.erro}
          onTentarDeNovo={resumoState.recarregar}
          atualizadoEm={resumoState.atualizadoEm}
        />

        <Tabs value={subAbaExecucoes} onValueChange={(valor) => setSubAbaExecucoes(valor as SubAbaExecucoes)}>
          <TabsList className="h-auto w-full justify-start gap-1 rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger value="lista" className={classeAba}>
              Lista de execuções
            </TabsTrigger>
            <TabsTrigger value="fila" className={cn(classeAba, "gap-1.5")}>
              Fila pendente
              {!filaState.carregando && filaState.itens.length > 0 && (
                <span className="tabular text-muted-foreground">({filaState.itens.length})</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-3">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_24rem]">
              <IaExecucoesLista
                itens={execucoesState.itens}
                carregando={execucoesState.carregando}
                erro={execucoesState.erro}
                onTentarDeNovo={execucoesState.recarregar}
                execucaoSelecionadaId={runIdSelecionado}
                onSelecionar={(execucao: ExecucaoItem) => setRunIdSelecionado(execucao.runId)}
                periodoSemExecucoes={Boolean(periodoSemExecucoes)}
              />

              <IaExecucaoDetalhe
                execucao={execucaoSelecionada}
                passos={passosState.itens}
                carregandoPassos={passosState.carregando}
                erroPassos={passosState.erro}
                onTentarDeNovoPassos={passosState.recarregar}
              />
            </div>
          </TabsContent>

          <TabsContent value="fila" className="mt-3">
            <IaFilaPendente
              itens={filaState.itens}
              carregando={filaState.carregando}
              erro={filaState.erro}
              onTentarDeNovo={filaState.recarregar}
            />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="configuracao" className="mt-0">
        <IaConfig
          config={configState.config}
          carregandoConfig={configState.carregando}
          erroConfig={configState.erro}
          onTentarDeNovoConfig={configState.recarregar}
          tools={toolsState.itens}
          carregandoTools={toolsState.carregando}
          erroTools={toolsState.erro}
          onTentarDeNovoTools={toolsState.recarregar}
        />
      </TabsContent>
    </Tabs>
  );
}
