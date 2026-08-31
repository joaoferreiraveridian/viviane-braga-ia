/**
 * Controle e monitoramento do agente DENTRO de uma conversa.
 *
 * Duas coisas, porque as duas vivem no mesmo lugar da tela:
 *   1. ligar/desligar a IA só para esta conversa (`ia_ativa`);
 *   2. acompanhar as execuções desta conversa ao vivo.
 *
 * O estado por conversa já existia no banco (`core.agente_ia_estado.ia_ativa`,
 * escrito pelos comandos "#pausar"/"#voltar" do WhatsApp e lido pelo
 * `whatsapp-webhook` antes de enfileirar). A migração 0011 só abriu a leitura
 * e a escrita para a tela. Ou seja: o botão daqui e o "#pausar" mandam no
 * MESMO estado — pausar pela tela e voltar pelo WhatsApp funciona.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

export interface ExecucaoDaConversa {
  runId: string;
  status: string;
  inputText: string | null;
  outputText: string | null;
  error: string | null;
  latencyMs: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  createdAt: string;
  finishedAt: string | null;
  totalSteps: number | null;
  ferramentasUsadas: string[];
}

/** Status que ainda vão mudar — usados para saber se há algo acontecendo agora. */
const STATUS_EM_ANDAMENTO = new Set(["pending", "running"]);

export function useAgenteConversa(conversaId: string | null) {
  const [iaAtiva, setIaAtiva] = useState<boolean | null>(null);
  const [execucoes, setExecucoes] = useState<ExecucaoDaConversa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [disparando, setDisparando] = useState(false);

  // Evita que uma resposta atrasada de uma conversa anterior sobrescreva a
  // conversa que o operador já trocou (o clássico race de troca de seleção).
  const conversaAtual = useRef<string | null>(null);
  conversaAtual.current = conversaId;

  const carregarExecucoes = useCallback(async () => {
    if (!supabase || !conversaId) return;
    const { data, error } = await supabase
      .schema("api")
      .from("vw_agente_conversa_execucao")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (conversaAtual.current !== conversaId) return;
    if (error) {
      setErro(error.message);
      return;
    }
    setErro(null);
    setExecucoes(
      (data ?? []).map((r) => ({
        runId: r.run_id as string,
        status: r.status as string,
        inputText: r.input_text as string | null,
        outputText: r.output_text as string | null,
        error: r.error as string | null,
        latencyMs: r.latency_ms as number | null,
        totalTokens: r.total_tokens as number | null,
        costUsd: r.cost_usd as number | null,
        createdAt: r.created_at as string,
        finishedAt: r.finished_at as string | null,
        totalSteps: r.total_steps as number | null,
        ferramentasUsadas: (r.ferramentas_usadas as string[] | null) ?? [],
      })),
    );
  }, [conversaId]);

  // Carga inicial: estado da IA + execuções.
  useEffect(() => {
    if (!supabase || !conversaId) {
      setIaAtiva(null);
      setExecucoes([]);
      return;
    }
    let ativo = true;
    setCarregando(true);

    void (async () => {
      const { data, error } = await supabase!
        .schema("api")
        .from("vw_agente_conversa_estado")
        .select("atendendo")
        .eq("conversa_id", conversaId)
        .maybeSingle();

      if (!ativo || conversaAtual.current !== conversaId) return;
      // `atendendo` é o estado EFETIVO (migração 0016): já combina o
      // interruptor geral, a pausa da conversa, o override `ia_forcada` e o
      // portão de anúncio. Ler `ia_ativa` cru fazia a tela dizer "IA
      // atendendo" com o agente global desligado — mentira que confundiu na
      // prática.
      // NUNCA transformar falha de leitura em "desligado". Era o bug: um 403
      // na view (grant faltando, corrigido na 0017) virava `false` e a tela
      // afirmava "IA não atende esta conversa" enquanto a IA respondia. Erro
      // agora deixa o estado em `null` = desconhecido, e o toggle desabilita.
      if (error) {
        setErro(error.message);
        setIaAtiva(null);
        return;
      }
      setErro(null);
      setIaAtiva((data?.atendendo as boolean | undefined) ?? false);

      await carregarExecucoes();
      if (ativo) setCarregando(false);
    })();

    return () => {
      ativo = false;
    };
  }, [conversaId, carregarExecucoes]);

  // Realtime: a linha de `core.agente_ia_run` muda ~3 vezes por execução
  // (pending -> running -> succeeded/failed). Usamos o evento apenas como
  // SINAL e reconsultamos a view — que é enxuta e já traz os passos e as
  // ferramentas agregadas, coisa que o payload cru não tem.
  useEffect(() => {
    if (!supabase || !conversaId) return;
    const canal = supabase
      .channel(`agente_run_${conversaId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "core", table: "agente_ia_run", filter: `pessoa_id=eq.${conversaId}` },
        () => {
          void carregarExecucoes();
        },
      )
      .subscribe();

    return () => {
      void supabase!.removeChannel(canal);
    };
  }, [conversaId, carregarExecucoes]);

  const definirIaAtiva = useCallback(
    async (ativa: boolean) => {
      if (!supabase || !conversaId) return;
      const anterior = iaAtiva;
      setIaAtiva(ativa); // otimista: o botão responde na hora
      setSalvando(true);
      const { data, error } = await supabase
        .schema("api")
        .rpc("fn_agente_conversa_definir_ativa", { p_conversa_id: conversaId, p_ativa: ativa });
      setSalvando(false);
      if (error) {
        setIaAtiva(anterior); // desfaz: nunca fingir que salvou
        throw error;
      }
      // A função devolve `ia_ativa`, mas quem manda na tela é o estado
      // efetivo: reconsultamos em vez de confiar no retorno.
      void data;
      const { data: estado, error: erroEstado } = await supabase
        .schema("api")
        .from("vw_agente_conversa_estado")
        .select("atendendo")
        .eq("conversa_id", conversaId)
        .maybeSingle();
      // Mesmo cuidado da carga inicial: sem leitura, estado desconhecido —
      // não inventar "desligado".
      if (erroEstado) {
        setErro(erroEstado.message);
        setIaAtiva(null);
        return;
      }
      if (estado) setIaAtiva(estado.atendendo as boolean);
    },
    [conversaId, iaAtiva],
  );

  /**
   * Dispara o agente nesta conversa AGORA, mesmo com o interruptor geral
   * desligado (api.fn_agente_disparar, migração 0014). Serve para testar um
   * lead específico sem ligar o agente para todo mundo.
   */
  const dispararAgora = useCallback(async () => {
    if (!supabase || !conversaId) return;
    setDisparando(true);
    const { data, error } = await supabase
      .schema("api")
      .rpc("fn_agente_disparar", { p_conversa_id: conversaId });
    setDisparando(false);
    if (error) throw error;
    // O realtime já traz a run nova, mas recarregamos para o painel reagir na
    // hora mesmo se o canal estiver reconectando.
    await carregarExecucoes();
    return data as string;
  }, [conversaId, carregarExecucoes]);

  const rodandoAgora = execucoes.some((e) => STATUS_EM_ANDAMENTO.has(e.status));

  return {
    iaAtiva, definirIaAtiva, salvando,
    execucoes, carregando, erro, rodandoAgora,
    dispararAgora, disparando,
    recarregar: carregarExecucoes,
  };
}
