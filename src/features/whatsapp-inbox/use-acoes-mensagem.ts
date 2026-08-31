import { useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Excluir/editar/reagir numa mensagem já enviada/recebida — chama a edge function
 * `whatsapp-mensagem-acoes`, que sincroniza a ação no WhatsApp de verdade antes de atualizar o
 * banco (nunca finge sucesso local). O componente que chama isso deve aplicar o patch otimista em
 * `atualizarLocal` (de `use-mensagens.ts`) ANTES de chamar essas funções, e desfazer se falhar —
 * ver reference/realtime.md, seção "Ações próprias".
 */
export function useAcoesMensagem() {
  const [pendenteId, setPendenteId] = useState<string | null>(null);

  async function chamar(body: {
    acao: "excluir" | "editar" | "reagir";
    mensagem_id: string;
    texto?: string;
    emoji?: string;
  }) {
    setPendenteId(body.mensagem_id);
    try {
      if (!supabase) {
        throw new Error("Supabase não configurado — falta VITE_SUPABASE_ANON_KEY.");
      }
      const { data, error } = await supabase.functions.invoke("whatsapp-mensagem-acoes", { body });
      if (error || data?.error) {
        throw new Error(data?.error ?? error?.message ?? "Falha ao executar a ação.");
      }
    } finally {
      setPendenteId(null);
    }
  }

  return {
    pendenteId,
    excluirMensagem: (mensagemId: string) => chamar({ acao: "excluir", mensagem_id: mensagemId }),
    editarMensagem: (mensagemId: string, texto: string) => chamar({ acao: "editar", mensagem_id: mensagemId, texto }),
    reagirMensagem: (mensagemId: string, emoji: string) => chamar({ acao: "reagir", mensagem_id: mensagemId, emoji }),
  };
}
