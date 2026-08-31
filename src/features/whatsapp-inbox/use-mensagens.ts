import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Mensagem, mapMensagem } from "./types";

const LIMITE = 300;

interface EstadoMensagens {
  mensagens: Mensagem[];
  carregando: boolean;
  erro: string | null;
}

export function useMensagens(conversaId: string | null) {
  const [estado, setEstado] = useState<EstadoMensagens>({
    mensagens: [],
    carregando: false,
    erro: null,
  });

  useEffect(() => {
    if (!conversaId) {
      setEstado({ mensagens: [], carregando: false, erro: null });
      return;
    }

    if (!supabase) {
      setEstado({ mensagens: [], carregando: false, erro: null });
      return;
    }
    let cancelado = false;

    async function carregar() {
      setEstado({ mensagens: [], carregando: true, erro: null });
      const { data, error } = await supabase!
        .from("whatsapp_mensagens")
        .select("*")
        .eq("conversa_id", conversaId)
        .order("ocorrido_em", { ascending: true })
        .limit(LIMITE);

      if (cancelado) return;
      if (error) {
        setEstado({ mensagens: [], carregando: false, erro: error.message });
        return;
      }
      setEstado({ mensagens: (data ?? []).map(mapMensagem), carregando: false, erro: null });
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [conversaId]);

  useEffect(() => {
    if (!conversaId || !supabase) return;

    const canal = supabase
      .channel(`whatsapp_mensagens_${conversaId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens", filter: `conversa_id=eq.${conversaId}` },
        (payload) => {
          const nova = mapMensagem(payload.new as Record<string, unknown>);
          setEstado((atual) => {
            // dedupe contra a bolha otimista equivalente (mesmo id_externo)
            const semOtimistaEquivalente = atual.mensagens.filter(
              (m) => !(m.otimista && m.idExterno === nova.idExterno),
            );
            if (semOtimistaEquivalente.some((m) => m.id === nova.id)) return atual;
            return { ...atual, mensagens: [...semOtimistaEquivalente, nova] };
          });
        },
      )
      .on(
        // Sem isso, reação/edição/exclusão feita pelo CONTATO direto no WhatsApp dele nunca
        // aparece na tela sem recarregar — ver reference/realtime.md.
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_mensagens", filter: `conversa_id=eq.${conversaId}` },
        (payload) => {
          const atualizada = mapMensagem(payload.new as Record<string, unknown>);
          setEstado((atual) => ({
            ...atual,
            mensagens: atual.mensagens.map((m) => (m.id === atualizada.id ? atualizada : m)),
          }));
        },
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(canal);
    };
  }, [conversaId]);

  /** Usado pelo hook de envio para inserir a bolha otimista antes da confirmação. */
  function adicionarOtimista(mensagem: Mensagem) {
    setEstado((atual) => ({ ...atual, mensagens: [...atual.mensagens, mensagem] }));
  }

  /** Usado pelo hook de envio para remover a bolha otimista se o envio falhar. */
  function removerOtimista(idExterno: string) {
    setEstado((atual) => ({
      ...atual,
      mensagens: atual.mensagens.filter((m) => m.idExterno !== idExterno || !m.otimista),
    }));
  }

  /**
   * Usado por excluir/editar/reagir (ver use-acoes-mensagem.ts) pra aplicar a mudança no
   * mesmo instante do clique, sem esperar o UPDATE do realtime — ver reference/realtime.md.
   */
  function atualizarLocal(id: string, patch: Partial<Mensagem>) {
    setEstado((atual) => ({
      ...atual,
      mensagens: atual.mensagens.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }

  return { ...estado, adicionarOtimista, removerOtimista, atualizarLocal };
}
