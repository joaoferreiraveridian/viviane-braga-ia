import type { DateRange } from "react-day-picker";

/**
 * Decide o próximo intervalo a partir do dia que o operador clicou.
 *
 * O `react-day-picker` em `mode="range"` não consegue representar um dia
 * único do jeito que os filtros precisam: com `min={1}`, clicar de novo no
 * mesmo dia que já é o início devolve `undefined` (limpa a seleção) em vez
 * de fechar o intervalo nele mesmo; e com `min={0}` o primeiro clique já
 * devolve um intervalo completo, o que faria o filtro aplicar sozinho antes
 * de escolher a data final. Por isso a decisão mora aqui, olhando só o dia
 * clicado — o intervalo calculado pelo calendário é ignorado nas telas.
 *
 * Regra: sem início pendente, o clique abre um intervalo novo; com início
 * pendente, o clique fecha o intervalo — inclusive no mesmo dia, que vira um
 * recorte de um dia só. Clique anterior ao início inverte as pontas.
 */
export function proximoIntervalo(pendente: DateRange | undefined, diaClicado: Date): DateRange {
  const inicioPendente = pendente?.from && !pendente.to ? pendente.from : undefined;
  if (!inicioPendente) return { from: diaClicado, to: undefined };
  return diaClicado < inicioPendente
    ? { from: diaClicado, to: inicioPendente }
    : { from: inicioPendente, to: diaClicado };
}
