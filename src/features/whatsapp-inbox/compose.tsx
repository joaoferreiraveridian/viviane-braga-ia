import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const ALTURA_MAXIMA_PX = 120;

interface ComposeProps {
  onEnviar: (texto: string) => Promise<void>;
  desabilitado?: boolean;
}

/**
 * Textarea que cresce verticalmente conforme o usuário digita (até `ALTURA_MAXIMA_PX`, depois
 * rola) — igual WhatsApp. Um `<input>` de uma linha só faz o texto rolar horizontalmente e corta o
 * início do que foi digitado, que é o comportamento "feio" que gerou esta troca originalmente.
 * Enter envia, Shift+Enter quebra linha.
 */
export function Compose({ onEnviar, desabilitado }: ComposeProps) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, ALTURA_MAXIMA_PX)}px`;
  }, [texto]);

  async function handleEnviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    setTexto("");
    setEnviando(true);
    try {
      await onEnviar(conteudo);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-border p-3">
      <Textarea
        ref={textareaRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleEnviar();
          }
        }}
        placeholder="Escreva uma mensagem..."
        disabled={desabilitado || enviando}
        rows={1}
        className="min-h-9 resize-none"
      />
      <Button size="icon" className="shrink-0" onClick={handleEnviar} disabled={desabilitado || enviando || !texto.trim()}>
        <Send className="size-4" />
      </Button>
    </div>
  );
}
