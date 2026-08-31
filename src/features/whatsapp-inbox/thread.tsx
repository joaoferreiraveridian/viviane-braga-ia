import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useMensagens } from "./use-mensagens";
import { useEnviarMensagem } from "./use-enviar-mensagem";
import { AgenteConversaPainel } from "./agente-conversa-painel";
import { MessageBubble, textoResumo } from "./message-bubble";
import { Compose } from "./compose";
import { Conversa, Mensagem } from "./types";

const REMETENTE_LABEL: Record<string, string> = { agente: "Você", bot: "IA", contato: "Contato" };

function descricaoDia(iso: string) {
  const data = new Date(iso);
  const hoje = new Date();
  const chaveDia = (d: Date) => d.toDateString();

  if (chaveDia(data) === chaveDia(hoje)) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (chaveDia(data) === chaveDia(ontem)) return "Ontem";

  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(data);
}

export function Thread({ conversa }: { conversa: Conversa | null }) {
  const { mensagens, carregando, erro, adicionarOtimista, removerOtimista, atualizarLocal } = useMensagens(
    conversa?.id ?? null,
  );
  const { enviarTexto } = useEnviarMensagem(conversa?.id ?? "", { adicionarOtimista, removerOtimista });
  const containerRef = useRef<HTMLDivElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const [respondendo, setRespondendo] = useState<Mensagem | null>(null);

  // Estado de controle do scroll — evita dois bugs reais encontrados em produção:
  // 1) `scrollIntoView({behavior:"auto"})` NÃO garante instantâneo — "auto" só obedece o CSS do
  //    elemento (se algum ancestral tiver `scroll-behavior: smooth`, anima do mesmo jeito). Setar
  //    `scrollTop` direto é a única forma 100% instantânea.
  // 2) Em React.StrictMode (dev), todo efeito roda 2x — se o "já pulei pra esta conversa" fosse
  //    controlado só por um booleano marcado na 1ª chamada, a 2ª chamada cairia por engano no
  //    branch de scroll suave. A comparação abaixo (mensagens.length > guardado) é imune a isso:
  //    na 2ª chamada da mesma conversa a quantidade não mudou, então não faz nada.
  const estadoScrollRef = useRef<{ conversaId: string | null; quantidade: number }>({ conversaId: null, quantidade: 0 });

  useEffect(() => {
    if (!conversa || carregando) return;
    const estado = estadoScrollRef.current;

    if (estado.conversaId !== conversa.id) {
      // Trocou de conversa (ou é a 1ª vez) — pula pro fim sem NENHUMA animação, igual WhatsApp
      // abre a conversa já na última mensagem.
      const container = containerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
        // Reforço: se alguma mídia (foto/vídeo) ainda não tinha altura definitiva no momento do
        // salto — reserve altura fixa nas miniaturas pra evitar isso na origem, mas isto aqui
        // cobre qualquer sobra — reaplica um frame depois, sem animação.
        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
        });
      }
      estadoScrollRef.current = { conversaId: conversa.id, quantidade: mensagens.length };
      return;
    }

    if (mensagens.length > estado.quantidade) {
      // Mensagem nova chegou com a conversa já aberta — só aqui anima suave.
      fimRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    estadoScrollRef.current = { conversaId: conversa.id, quantidade: mensagens.length };
  }, [mensagens.length, conversa, carregando]);

  useEffect(() => setRespondendo(null), [conversa?.id]);

  useEffect(() => {
    // Abrir a conversa (ou receber mensagem nova com ela já aberta) marca como lida — mesmo
    // efeito de "entrar na conversa" do WhatsApp. Ver reference/realtime.md.
    if (!conversa?.id || !supabase) return;
    supabase
      .from("whatsapp_conversas")
      .update({ lida_em: new Date().toISOString(), nao_lidas: 0 })
      .eq("id", conversa.id)
      .then(() => {});
  }, [conversa?.id, mensagens.length]);

  const mensagensPorId = useMemo(() => new Map(mensagens.map((m) => [m.id, m])), [mensagens]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, typeof mensagens>();
    for (const mensagem of mensagens) {
      const chave = new Date(mensagem.ocorridoEm).toDateString();
      mapa.set(chave, [...(mapa.get(chave) ?? []), mensagem]);
    }
    return Array.from(mapa.entries());
  }, [mensagens]);

  if (!conversa) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Selecione uma conversa</div>;
  }

  async function handleEnviar(texto: string) {
    try {
      await enviarTexto(texto, respondendo?.id);
      setRespondendo(null);
    } catch (erro) {
      // Sem isto a bolha otimista some e o atendente não fica sabendo que o
      // envio falhou — some da tela em silêncio e ele acha que mandou.
      toast.error("Não foi possível enviar a mensagem.", {
        description: erro instanceof Error ? erro.message : "Erro desconhecido.",
      });
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <AgenteConversaPainel conversaId={conversa.id} />
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        {carregando && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-2/3" />
            ))}
          </div>
        )}
        {erro && <p className="text-sm text-destructive">Não foi possível carregar as mensagens: {erro}</p>}
        {!carregando && !erro && mensagens.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}
        {grupos.map(([chave, mensagensDoDia]) => (
          <div key={chave} className="mb-4">
            <div className="mb-3 text-center text-xs text-muted-foreground">
              {descricaoDia(mensagensDoDia[0].ocorridoEm)}
            </div>
            <div className="flex flex-col gap-2">
              {mensagensDoDia.map((mensagem) => (
                <MessageBubble
                  key={mensagem.id}
                  mensagem={mensagem}
                  mensagensPorId={mensagensPorId}
                  onResponder={setRespondendo}
                  onAtualizarLocal={atualizarLocal}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      {respondendo && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border-l-2 border-l-primary bg-muted/40 px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium">Respondendo a {REMETENTE_LABEL[respondendo.remetente] ?? respondendo.remetente}</p>
            <p className="truncate text-xs text-muted-foreground">{textoResumo(respondendo)}</p>
          </div>
          <Button variant="ghost" size="icon" className="size-6 shrink-0 rounded-full" onClick={() => setRespondendo(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <Compose onEnviar={handleEnviar} />
    </div>
  );
}
