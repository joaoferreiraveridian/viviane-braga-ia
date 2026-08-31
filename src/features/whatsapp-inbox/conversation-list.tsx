import { useMemo, useState } from "react";
import { BotOff, Megaphone, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useConversas } from "./use-conversas";
import { MessageStatusTicks } from "./message-status-ticks";
import { Conversa } from "./types";
import { PRESETS_PERIODO_IA } from "@/features/agentes/format";
import type { PeriodoIa } from "@/features/agentes/types";

/**
 * Presets de data da lista de conversas. Reusa os mesmos de `agentes/format`
 * (mesma semântica de "Hoje"/"7 dias"/…) para os dois lados do sistema não
 * discordarem sobre o que é "7 dias". Aqui só os quatro que fazem sentido numa
 * caixa de entrada — mês passado numa lista de conversa ativa não serve.
 */
const PRESETS_CONVERSA = PRESETS_PERIODO_IA.filter((p) =>
  ["hoje", "7_dias", "30_dias", "tudo"].includes(p.id),
);

/**
 * Horário no padrão WhatsApp: hoje mostra a hora exata ("14:32"), ontem mostra "Ontem", dentro dos
 * últimos 7 dias mostra o dia da semana ("quarta-feira"), mais antigo mostra a data curta. Só
 * "hoje" faz sentido em relativo (`há 3 min`) pra sempre — o resto vira ambíguo rápido numa lista
 * que atualiza sozinha via realtime.
 */
function formatarQuando(iso: string | null) {
  if (!iso) return "";
  const data = new Date(iso);
  const agora = new Date();
  const msPorDia = 86_400_000;
  const diffDias = Math.floor((agora.setHours(0, 0, 0, 0) - new Date(data).setHours(0, 0, 0, 0)) / msPorDia);

  if (diffDias === 0) return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(data);
  if (diffDias === 1) return "Ontem";
  if (diffDias < 7) return new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(data);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(data);
}

/** "+5521977297413" -> "+55 21 97729-7413". Telefone fora do padrão volta cru. */
function formatarTelefone(e164: string) {
  const d = e164.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  return e164;
}

/** Iniciais para o avatar: nome quando há, senão os dois últimos dígitos. */
function iniciaisDe(nome: string | null, telefone: string) {
  if (nome?.trim()) {
    return nome
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase();
  }
  return telefone.replace(/\D/g, "").slice(-2);
}

interface ConversationListProps {
  instanciaId: string;
  conversaSelecionadaId: string | null;
  onSelecionar: (conversa: Conversa) => void;
}

export function ConversationList({ instanciaId, conversaSelecionadaId, onSelecionar }: ConversationListProps) {
  const { conversas, carregando, erro, temMais, carregarMais } = useConversas(instanciaId);
  const [busca, setBusca] = useState("");
  // `null` = "Tudo" (sem recorte). Guardamos o preset escolhido, não as datas,
  // para "Hoje" continuar sendo hoje se a tela ficar aberta virando o dia.
  const [presetId, setPresetId] = useState<string>("tudo");
  const periodo = useMemo<PeriodoIa | null>(() => {
    if (presetId === "tudo") return null;
    const preset = PRESETS_CONVERSA.find((p) => p.id === presetId);
    if (!preset) return null;
    const { inicio, fim } = preset.calcular(new Date());
    return { inicio, fim, presetId: preset.id };
  }, [presetId]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const inicio = periodo?.inicio.getTime() ?? null;
    const fim = periodo?.fim.getTime() ?? null;

    return conversas.filter((c) => {
      if (termo && !(c.contatoNome?.toLowerCase().includes(termo) || c.contatoTelefone.includes(termo))) {
        return false;
      }
      if (inicio == null || fim == null) return true;
      // Conversa sem mensagem nenhuma não tem data para comparar: fica de fora
      // de qualquer recorte que não seja "Tudo" (periodo null).
      if (!c.ultimaMensagemEm) return false;
      const quando = new Date(c.ultimaMensagemEm).getTime();
      return quando >= inicio && quando <= fim;
    });
  }, [conversas, busca, periodo]);

  return (
    <div className="flex w-80 flex-col border-r border-border">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-8"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {PRESETS_CONVERSA.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={presetId === preset.id ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setPresetId(preset.id)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {carregando && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}
        {erro && <p className="p-3 text-sm text-destructive">Não foi possível carregar as conversas: {erro}</p>}
        {!carregando && !erro && filtradas.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">
            {presetId === "tudo"
              ? "Nenhuma conversa encontrada."
              : "Nenhuma conversa com mensagem neste período."}
          </p>
        )}
        {filtradas.map((conversa) => {
          const selecionada = conversa.id === conversaSelecionadaId;
          const veioDeAnuncio = Boolean(conversa.fonte || conversa.textoAnuncio);
          return (
            <button
              key={conversa.id}
              onClick={() => onSelecionar(conversa)}
              aria-current={selecionada ? "true" : undefined}
              className={cn(
                // Selecionado é uma barra à esquerda + fundo neutro, NUNCA
                // `bg-accent`: o token --accent deste tema é azul saturado
                // (217 91% 45%) e pintava a linha inteira, apagando o texto.
                "flex w-full gap-2.5 border-b border-l-2 border-border border-l-transparent p-3 text-left transition-colors",
                selecionada ? "border-l-primary bg-muted" : "hover:bg-muted/50",
              )}
            >
              <Avatar className="mt-0.5 size-9 shrink-0">
                <AvatarFallback className="text-xs">
                  {iniciaisDe(conversa.contatoNome, conversa.contatoTelefone)}
                </AvatarFallback>
              </Avatar>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {conversa.contatoNome?.trim() || "Sem nome"}
                  </span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {formatarQuando(conversa.ultimaMensagemEm)}
                  </span>
                </span>

                {/* O telefone agora aparece SEMPRE, não só quando falta o nome:
                    é o identificador real do lead. */}
                <span className="flex items-center gap-1.5">
                  <span className="tabular truncate text-xs text-muted-foreground">
                    {formatarTelefone(conversa.contatoTelefone)}
                  </span>
                  {veioDeAnuncio && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                      title={conversa.textoAnuncio ?? conversa.fonte ?? "Veio de anúncio"}
                    >
                      <Megaphone className="size-2.5" aria-hidden />
                      Anúncio
                    </span>
                  )}
                  {conversa.iaAtiva === false && (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-sm px-1 text-[10px] font-medium text-destructive"
                      title="A IA está desligada nesta conversa"
                    >
                      <BotOff className="size-2.5" aria-hidden />
                      IA off
                    </span>
                  )}
                </span>

                <span className="flex items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                    {(conversa.ultimaMensagemRemetente === "agente" || conversa.ultimaMensagemRemetente === "bot") &&
                      conversa.ultimaMensagemStatus && (
                        <MessageStatusTicks status={conversa.ultimaMensagemStatus} className="shrink-0" />
                      )}
                    <span className="truncate">{conversa.ultimaMensagemConteudo ?? "Sem mensagens"}</span>
                  </span>
                  {conversa.naoLidas > 0 && (
                    <span className="tabular shrink-0 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
                      {conversa.naoLidas}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
        {temMais && !carregando && (
          <Button variant="ghost" className="w-full" onClick={carregarMais}>
            Carregar mais
          </Button>
        )}
      </div>
    </div>
  );
}
