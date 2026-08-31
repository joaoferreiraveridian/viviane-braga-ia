import { Card } from "@/components/ui/card";
import { RecencyBadge } from "./shared/recency-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InboxErro } from "./shared/erro";
import { formatarCustoUsdTotal, formatarLatencia, formatarTokens } from "./format";
import type { ExecucaoResumo } from "./types";

interface IaResumoProps {
  resumo: ExecucaoResumo | null;
  carregando: boolean;
  erro: boolean;
  onTentarDeNovo: () => void;
  atualizadoEm: string | null;
}

interface Metrica {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}

/**
 * Faixa de resumo do período (`fn_agente_execucao_resumo`) — sete números densos
 * numa linha só, cada um com `.tabular`, nunca serifado. Sem cartão inflado
 * com um número gigante: aqui é uma tira de indicadores, o padrão de
 * densidade da skill vrc-design.
 */
export function IaResumo({ resumo, carregando, erro, onTentarDeNovo, atualizadoEm }: IaResumoProps) {
  if (erro) {
    return (
      <InboxErro
        titulo="Não deu para carregar o resumo de execuções"
        descricao="A consulta a fn_agente_execucao_resumo falhou — pode ter sido uma instabilidade de rede. Tentar de novo costuma resolver."
        onTentarDeNovo={onTentarDeNovo}
      />
    );
  }

  if (carregando) {
    return (
      <Card className="flex flex-wrap gap-6 p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-24" />
        ))}
      </Card>
    );
  }

  const metricas: Metrica[] = resumo
    ? [
        { rotulo: "Execuções", valor: resumo.totalRuns.toLocaleString("pt-BR") },
        { rotulo: "Sucesso", valor: resumo.succeeded.toLocaleString("pt-BR") },
        { rotulo: "Erro", valor: resumo.failed.toLocaleString("pt-BR") },
        { rotulo: "Pulada", valor: resumo.skipped.toLocaleString("pt-BR") },
        { rotulo: "Em andamento", valor: (resumo.pending + resumo.running).toLocaleString("pt-BR") },
        { rotulo: "Custo total", valor: formatarCustoUsdTotal(resumo.custoTotalUsd) },
        { rotulo: "Tokens totais", valor: formatarTokens(resumo.tokensTotais) },
        { rotulo: "Latência média", valor: formatarLatencia(resumo.latenciaMediaMs) },
      ]
    : [];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-base text-foreground">Resumo do período</h2>
        {atualizadoEm && <RecencyBadge atualizadoEm={atualizadoEm} />}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {metricas.map((metrica) => (
          <div key={metrica.rotulo} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{metrica.rotulo}</span>
            <span
              className={
                metrica.rotulo === "Erro" && resumo && resumo.failed > 0
                  ? "text-xl font-medium tabular leading-none text-destructive"
                  : "text-xl font-medium tabular leading-none text-foreground"
              }
            >
              {metrica.valor}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
