import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageAudioProps {
  /** URL pública já resolvida (ex.: `supabase.storage.from(bucket).getPublicUrl(mensagem.mediaPath).data.publicUrl`) — este componente não resolve o path sozinho. */
  url: string;
  enviada: boolean;
}

const QTD_BARRAS = 32;

function formatarTempo(segundos: number): string {
  if (!Number.isFinite(segundos)) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Alturas de barra pseudo-aleatórias mas estáveis por URL — sem análise real do áudio (Web Audio
 * API seria mais fiel, mas é peso desnecessário aqui), só o suficiente pra parecer uma waveform de
 * verdade em vez de uma barra lisa, igual ao player do WhatsApp.
 */
function alturasWaveform(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const alturas: number[] = [];
  for (let i = 0; i < QTD_BARRAS; i++) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    alturas.push(0.3 + ((hash % 100) / 100) * 0.7);
  }
  return alturas;
}

/**
 * Player de áudio estilo WhatsApp: botão redondo sólido + waveform de barrinhas (não uma barra de
 * progresso lisa) + tempo. As barras precisam ser `<div>` (bloco), nunca `<span>` — span é inline
 * por padrão e CSS ignora `height` em elemento inline, o que faz as barras "sumirem" (renderizam
 * com altura zero) mesmo com o código certo. E use altura em **pixels fixos**, não `%` — `%` de
 * altura dentro de flex item nem sempre resolve de forma confiável entre navegadores.
 */
export function MessageAudio({ url, enviada }: MessageAudioProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [tempoAtual, setTempoAtual] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const alturas = useMemo(() => alturasWaveform(url), [url]);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    const aoCarregar = () => {
      setDuracao(audio.duration);
      setCarregando(false);
    };
    const aoAtualizar = () => setTempoAtual(audio.currentTime);
    const aoTerminar = () => {
      setTocando(false);
      setTempoAtual(0);
    };
    const aoErrar = () => {
      setCarregando(false);
      setErro(true);
    };

    audio.addEventListener("loadedmetadata", aoCarregar);
    audio.addEventListener("timeupdate", aoAtualizar);
    audio.addEventListener("ended", aoTerminar);
    audio.addEventListener("error", aoErrar);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", aoCarregar);
      audio.removeEventListener("timeupdate", aoAtualizar);
      audio.removeEventListener("ended", aoTerminar);
      audio.removeEventListener("error", aoErrar);
    };
  }, [url]);

  function alternarReproducao() {
    const audio = audioRef.current;
    if (!audio || carregando) return;
    if (tocando) {
      audio.pause();
      setTocando(false);
    } else {
      void audio.play();
      setTocando(true);
    }
  }

  function buscarPosicao(evento: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duracao) return;
    const rect = evento.currentTarget.getBoundingClientRect();
    const proporcao = Math.min(1, Math.max(0, (evento.clientX - rect.left) / rect.width));
    audio.currentTime = proporcao * duracao;
    setTempoAtual(audio.currentTime);
  }

  if (erro) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <AlertCircle className="size-4 text-destructive" />
        <span>Não foi possível carregar o áudio.</span>
      </div>
    );
  }

  const progresso = duracao > 0 ? (tempoAtual / duracao) * 100 : 0;
  const barrasTocadas = Math.round((progresso / 100) * QTD_BARRAS);
  const corBotao = enviada ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground";
  const corBarraTocada = enviada ? "bg-primary-foreground" : "bg-primary";
  const corBarraOciosa = enviada ? "bg-primary-foreground opacity-40" : "bg-foreground opacity-30";

  return (
    <div className="flex w-fit items-center gap-2">
      <button
        type="button"
        onClick={alternarReproducao}
        disabled={carregando}
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-full disabled:opacity-60", corBotao)}
      >
        {carregando ? (
          <Loader2 className="size-4 animate-spin" />
        ) : tocando ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 translate-x-0.5" />
        )}
      </button>
      <div className="flex min-w-0 flex-col gap-1">
        <div onClick={buscarPosicao} className="flex h-7 cursor-pointer items-end gap-[2px]">
          {alturas.map((altura, i) => (
            <div
              key={i}
              className={cn("shrink-0 rounded-full transition-colors", i < barrasTocadas ? corBarraTocada : corBarraOciosa)}
              style={{ width: "2.5px", height: `${Math.round(Math.max(4, altura * 24))}px` }}
            />
          ))}
        </div>
        <span className="tabular text-[11px] opacity-70">
          {formatarTempo(tocando || tempoAtual > 0 ? tempoAtual : duracao)}
        </span>
      </div>
    </div>
  );
}
