import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Mensagem } from "./types";

interface UseMensagensRetorno {
  adicionarOtimista: (mensagem: Mensagem) => void;
  removerOtimista: (idExterno: string) => void;
}

export function useEnviarMensagem(conversaId: string, mensagens: UseMensagensRetorno) {
  const [enviando, setEnviando] = useState(false);

  // respostaAId só alimenta a bolha otimista: a citação não é transmitida
  // porque whatsapp-send ainda não a suporta, e a UI de responder nunca
  // renderiza (depende de id_provedor/owner_provedor, que ninguém grava).
  // Ver a ressalva sobre whatsapp-mensagem-acoes em docs/segredos-pendentes.md.
  async function enviarTexto(texto: string, respostaAId?: string) {
    const idExterno = crypto.randomUUID();
    const agora = new Date().toISOString();

    mensagens.adicionarOtimista({
      id: `otimista-${idExterno}`,
      conversaId,
      direcao: "saida",
      remetente: "agente",
      tipoConteudo: "texto",
      conteudo: texto,
      mediaPath: null,
      idExterno,
      idProvedor: null,
      ownerProvedor: null,
      respostaAId: respostaAId ?? null,
      reacoes: [],
      editadoEm: null,
      apagadoEm: null,
      statusEntrega: "enviando",
      ocorridoEm: agora,
      otimista: true,
    });

    if (!supabase) {
      mensagens.removerOtimista(idExterno);
      throw new Error("Supabase não configurado — falta VITE_SUPABASE_ANON_KEY.");
    }

    setEnviando(true);
    const { error } = await supabase.functions.invoke("whatsapp-send", {
      // Os nomes têm que bater com EnviarPayload de supabase/functions/whatsapp-send/index.ts.
      // No vocabulário do agente, "pessoa" é a conversa: pessoa_id = conversa_id.
      body: { pessoa_id: conversaId, mensagem: texto, id_externo: idExterno, remetente: "agente" },
    });
    setEnviando(false);

    if (error) {
      // Nunca finge sucesso: some a bolha se a function falhar.
      mensagens.removerOtimista(idExterno);
      throw error;
    }
  }

  return { enviarTexto, enviando };
}
