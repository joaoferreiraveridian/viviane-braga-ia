import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageStatusTicksProps {
  status: string;
  className?: string;
}

/**
 * Tiquinhos estilo WhatsApp pras próprias mensagens: relógio (enviando), um check (enviado),
 * dois checks (entregue), dois checks na cor de destaque do projeto (lido — troque `text-primary`
 * pelo token de "cor de marca" do design system do projeto, ex.: `text-gold`, se o projeto tiver
 * um). Reaproveitado na lista de conversas e no balão da thread — mesmo componente, sem duplicar
 * o mapeamento.
 */
export function MessageStatusTicks({ status, className }: MessageStatusTicksProps) {
  if (status === "falhou") {
    return <AlertCircle className={cn("size-3 text-destructive", className)} aria-label="Falha ao enviar" />;
  }
  if (status === "enviando") {
    return <Clock className={cn("size-3", className)} aria-label="Enviando" />;
  }
  if (status === "lido") {
    return <CheckCheck className={cn("size-3.5 text-primary", className)} aria-label="Lida" />;
  }
  if (status === "entregue") {
    return <CheckCheck className={cn("size-3.5", className)} aria-label="Entregue" />;
  }
  return <Check className={cn("size-3.5", className)} aria-label="Enviada" />;
}
