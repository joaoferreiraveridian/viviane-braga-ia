import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Conversa, mapConversa } from "./types";

const PAGINA = 30;

type LinhaEnriquecimento = Record<string, unknown>;

/**
 * Cola o enriquecimento nas conversas por id. Preserva o que já havia quando a
 * linha nova não traz o dado — é o que impede o realtime (que só conhece as
 * colunas de `whatsapp_conversas`) de apagar a origem do anúncio e o estado da
 * IA a cada mensagem que chega.
 */
function mesclarEnriquecimento(conversas: Conversa[], extras: LinhaEnriquecimento[]): Conversa[] {
  const porId = new Map(extras.map((e) => [e.conversa_id as string, e]));
  return conversas.map((c) => {
    const extra = porId.get(c.id);
    if (!extra) return c;
    return {
      ...c,
      fonte: (extra.fonte as string) ?? null,
      textoAnuncio: (extra.texto_anuncio as string) ?? null,
      iaAtiva: extra.ia_ativa as boolean,
      mensagens: extra.mensagens as number,
      primeiroContato: (extra.primeiro_contato as string) ?? null,
    };
  });
}

interface EstadoConversas {
  conversas: Conversa[];
  carregando: boolean;
  erro: string | null;
  temMais: boolean;
}

export function useConversas(instanciaId: string) {
  const [estado, setEstado] = useState<EstadoConversas>({
    conversas: [],
    carregando: true,
    erro: null,
    temMais: false,
  });
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ conversas: [], carregando: false, erro: null, temMais: false });
      return;
    }
    let cancelado = false;

    async function carregar() {
      setEstado((atual) => ({ ...atual, carregando: true, erro: null }));
      const { data, error, count } = await supabase!
        .from("whatsapp_conversas")
        .select("*", { count: "exact" })
        .eq("instancia_id", instanciaId)
        .order("atualizado_em", { ascending: false })
        .range(0, (pagina + 1) * PAGINA - 1);

      if (cancelado) return;
      if (error) {
        setEstado({ conversas: [], carregando: false, erro: error.message, temMais: false });
        return;
      }
      const conversas = (data ?? []).map(mapConversa);
      setEstado({
        conversas,
        carregando: false,
        erro: null,
        temMais: (count ?? 0) > conversas.length,
      });

      // Enriquecimento numa segunda consulta, de propósito: `whatsapp_conversas`
      // não tem origem de anúncio (mora na mensagem do clique) nem o estado da
      // IA (mora em core.agente_ia_estado). Buscar junto exigiria trocar a
      // fonte da lista por uma view, e aí o realtime — que assina a TABELA —
      // deixaria de casar. Assim a lista aparece na hora e os extras entram
      // logo atrás.
      const { data: extras } = await supabase!
        .schema("api")
        .from("vw_conversa_enriquecimento")
        .select("*")
        .in("conversa_id", conversas.map((c) => c.id));

      if (cancelado || !extras) return;
      setEstado((atual) => ({ ...atual, conversas: mesclarEnriquecimento(atual.conversas, extras) }));
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [instanciaId, pagina]);

  useEffect(() => {
    if (!supabase) return;
    const canal = supabase
      .channel(`whatsapp_conversas_${instanciaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_conversas",
          filter: `instancia_id=eq.${instanciaId}`,
        },
        (payload) => {
          setEstado((atual) => {
            if (payload.eventType === "DELETE") {
              return { ...atual, conversas: atual.conversas.filter((c) => c.id !== payload.old.id) };
            }
            const base = mapConversa(payload.new as Record<string, unknown>);
            // `mapConversa` só conhece as colunas da tabela; sem isto, toda
            // mensagem que chega apagaria o enriquecimento já carregado.
            const anterior = atual.conversas.find((c) => c.id === base.id);
            const conversaAtualizada: Conversa = anterior
              ? {
                  ...base,
                  fonte: anterior.fonte,
                  textoAnuncio: anterior.textoAnuncio,
                  iaAtiva: anterior.iaAtiva,
                  mensagens: anterior.mensagens,
                  primeiroContato: anterior.primeiroContato,
                }
              : base;
            const semAAntiga = atual.conversas.filter((c) => c.id !== conversaAtualizada.id);
            const reordenada = [conversaAtualizada, ...semAAntiga].sort(
              (a, b) => new Date(b.atualizadoEm).getTime() - new Date(a.atualizadoEm).getTime(),
            );
            return { ...atual, conversas: reordenada };
          });
        },
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(canal);
    };
  }, [instanciaId]);

  return {
    ...estado,
    carregarMais: () => setPagina((p) => p + 1),
  };
}
