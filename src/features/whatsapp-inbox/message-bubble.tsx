import { useState } from "react";
import { Bot, Pencil, Reply, SmilePlus, Trash2, User, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAcoesMensagem } from "./use-acoes-mensagem";
import { MessageStatusTicks } from "./message-status-ticks";
import { Mensagem } from "./types";

function formatarHora(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const REMETENTE_LABEL: Record<string, string> = { agente: "Você", bot: "IA", contato: "Contato" };
const REMETENTE_ICON: Record<string, typeof User> = { agente: User, bot: Bot, contato: UserRound };
const TIPO_LABEL: Record<string, string> = {
  imagem: "Foto",
  video: "Vídeo",
  audio: "Áudio",
  documento: "Documento",
  figurinha: "Figurinha",
};
const EMOJIS_RAPIDOS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export function textoResumo(mensagem: Mensagem): string {
  if (mensagem.apagadoEm) return "Mensagem apagada";
  return mensagem.conteudo ?? TIPO_LABEL[mensagem.tipoConteudo] ?? "Mensagem";
}

function CitacaoPreview({ original, enviada }: { original: Mensagem | null; enviada: boolean }) {
  const label = original ? REMETENTE_LABEL[original.remetente] ?? original.remetente : null;
  const resumo = original ? textoResumo(original) : "Mensagem original não disponível";
  return (
    <div
      className={cn(
        "mb-1.5 flex flex-col gap-0.5 rounded-md border-l-2 px-2 py-1 text-xs",
        enviada ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-foreground/30 bg-foreground/5",
      )}
    >
      {label && <span className="font-medium">{label}</span>}
      <span className="truncate opacity-80">{resumo}</span>
    </div>
  );
}

interface MessageBubbleProps {
  mensagem: Mensagem;
  /** Mapa id → mensagem das mensagens já carregadas na thread, pra resolver o preview de `respostaAId` sem query extra. */
  mensagensPorId: Map<string, Mensagem>;
  onResponder: (mensagem: Mensagem) => void;
  /** Aplica um patch otimista local (ver `atualizarLocal` de `use-mensagens.ts`) — chamado antes/depois das 3 ações, pra elas parecerem instantâneas. */
  onAtualizarLocal: (id: string, patch: Partial<Mensagem>) => void;
}

/**
 * Bolha de mensagem com a camada avançada: figurinha sem fundo de bolha (igual WhatsApp — sticker
 * não tem bolha colorida atrás), citação de resposta, selo de reação, tiquinhos de status, e uma
 * barrinha de ações ao passar o mouse (responder/reagir sempre disponíveis quando a mensagem tem
 * `idProvedor`; editar/excluir só nas próprias mensagens de texto/qualquer tipo respectivamente —
 * reagir só funciona em mensagens do CONTATO, é limitação real da API da Uazapi, não nossa).
 */
export function MessageBubble({ mensagem, mensagensPorId, onResponder, onAtualizarLocal }: MessageBubbleProps) {
  const enviada = mensagem.direcao === "saida";
  const Icone = REMETENTE_ICON[mensagem.remetente] ?? User;
  const { excluirMensagem, editarMensagem, reagirMensagem, pendenteId } = useAcoesMensagem();

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [editando, setEditando] = useState(false);
  const [valorEdicao, setValorEdicao] = useState(mensagem.conteudo ?? "");
  const [reacaoAberta, setReacaoAberta] = useState(false);

  const apagada = Boolean(mensagem.apagadoEm);
  const podeAgir = !mensagem.otimista && !apagada && Boolean(mensagem.idProvedor && mensagem.ownerProvedor);
  const podeEditarOuExcluir = podeAgir && enviada;
  const podeReagir = podeAgir && !enviada; // limitação da Uazapi: só reage a mensagem do contato
  const pendente = pendenteId === mensagem.id;

  const original = mensagem.respostaAId ? mensagensPorId.get(mensagem.respostaAId) ?? null : null;
  const minhaReacao = mensagem.reacoes.find((r) => r.remetente === "agente");
  const resumoReacoes = Array.from(new Set(mensagem.reacoes.map((r) => r.emoji))).join(" ");

  async function handleExcluir() {
    const anterior = mensagem.apagadoEm;
    onAtualizarLocal(mensagem.id, { apagadoEm: new Date().toISOString() });
    setConfirmandoExclusao(false);
    try {
      await excluirMensagem(mensagem.id);
    } catch {
      onAtualizarLocal(mensagem.id, { apagadoEm: anterior });
    }
  }

  async function handleSalvarEdicao() {
    const novo = valorEdicao.trim();
    if (!novo || novo === mensagem.conteudo) {
      setEditando(false);
      return;
    }
    const conteudoAnterior = mensagem.conteudo;
    const editadoEmAnterior = mensagem.editadoEm;
    setEditando(false);
    onAtualizarLocal(mensagem.id, { conteudo: novo, editadoEm: new Date().toISOString() });
    try {
      await editarMensagem(mensagem.id, novo);
    } catch {
      onAtualizarLocal(mensagem.id, { conteudo: conteudoAnterior, editadoEm: editadoEmAnterior });
    }
  }

  async function handleReagir(emoji: string) {
    setReacaoAberta(false);
    const novoEmoji = minhaReacao?.emoji === emoji ? "" : emoji;
    const reacoesAnteriores = mensagem.reacoes;
    const semMinha = mensagem.reacoes.filter((r) => r.remetente !== "agente");
    onAtualizarLocal(mensagem.id, {
      reacoes: novoEmoji ? [...semMinha, { emoji: novoEmoji, remetente: "agente", reagidoEm: new Date().toISOString() }] : semMinha,
    });
    try {
      await reagirMensagem(mensagem.id, novoEmoji);
    } catch {
      onAtualizarLocal(mensagem.id, { reacoes: reacoesAnteriores });
    }
  }

  const semBolha = mensagem.tipoConteudo === "figurinha";

  return (
    <div className={cn("group flex flex-col gap-1", enviada ? "items-end" : "items-start")}>
      <div className={cn("flex items-center gap-1", enviada && "flex-row-reverse")}>
        <div
          className={cn(
            "relative max-w-[26rem] rounded-lg",
            !semBolha && "px-3 py-2",
            !semBolha && (enviada ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"),
            mensagem.otimista && "opacity-60",
          )}
        >
          {(original !== null || mensagem.respostaAId) && <CitacaoPreview original={original} enviada={enviada} />}

          {apagada ? (
            <p className="flex items-center gap-1.5 text-sm opacity-70">
              <Trash2 className="size-3.5" /> Mensagem apagada
            </p>
          ) : editando ? (
            <div className="flex w-64 flex-col gap-2">
              <Textarea
                value={valorEdicao}
                onChange={(e) => setValorEdicao(e.target.value)}
                rows={2}
                className="resize-none border-none bg-background/10 text-sm text-inherit focus-visible:ring-1"
                autoFocus
              />
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 px-2 text-xs" onClick={handleSalvarEdicao} disabled={pendente}>
                  Salvar
                </Button>
              </div>
            </div>
          ) : mensagem.tipoConteudo === "figurinha" && mensagem.mediaPath ? (
            <img src={mensagem.mediaPath} alt="Figurinha" className="size-32 object-contain" />
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">
              {mensagem.conteudo ?? `[${TIPO_LABEL[mensagem.tipoConteudo] ?? mensagem.tipoConteudo}]`}
            </p>
          )}

          {resumoReacoes && (
            <span
              className={cn(
                "absolute -bottom-2.5 rounded-full border border-border bg-background px-1 text-xs shadow-sm",
                enviada ? "right-2" : "left-2",
              )}
            >
              {resumoReacoes}
            </span>
          )}
        </div>

        {podeAgir && !editando && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => onResponder(mensagem)}>
              <Reply className="size-3.5" />
            </Button>
            {podeReagir && (
              <Popover open={reacaoAberta} onOpenChange={setReacaoAberta}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 rounded-full">
                    <SmilePlus className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-1" align="center">
                  <div className="flex gap-0.5">
                    {EMOJIS_RAPIDOS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReagir(emoji)}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full text-base hover:bg-accent",
                          minhaReacao?.emoji === emoji && "bg-accent",
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {podeEditarOuExcluir && mensagem.tipoConteudo === "texto" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 rounded-full"
                onClick={() => {
                  setValorEdicao(mensagem.conteudo ?? "");
                  setEditando(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {podeEditarOuExcluir && (
              <Popover open={confirmandoExclusao} onOpenChange={setConfirmandoExclusao}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7 rounded-full text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3" align="end">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Excluir esta mensagem? Ela também some no WhatsApp do contato.
                  </p>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setConfirmandoExclusao(false)}>
                      Cancelar
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={handleExcluir}>
                      Excluir
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <Icone className="size-3" />
        <span className="font-medium">{REMETENTE_LABEL[mensagem.remetente] ?? mensagem.remetente}</span>
        <span className="tabular">{formatarHora(mensagem.ocorridoEm)}</span>
        {mensagem.editadoEm && <span className="opacity-70">editado</span>}
        {enviada && !apagada && <MessageStatusTicks status={mensagem.statusEntrega ?? "enviado"} />}
      </div>
    </div>
  );
}
