/**
 * Formatação de tempo relativo para o selo de recência ("atualizado há X").
 * Puramente apresentacional — não decide o que é "recente o suficiente",
 * apenas traduz uma diferença de tempo em texto legível em português.
 */
export function formatRecencia(dataISO: string, agora: Date = new Date()): string {
  const data = new Date(dataISO);
  const diffMs = agora.getTime() - data.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `há ${diffHoras}h`;

  const diffDias = Math.round(diffHoras / 24);
  if (diffDias === 1) return "há 1 dia";
  if (diffDias < 30) return `há ${diffDias} dias`;

  const diffMeses = Math.round(diffDias / 30);
  if (diffMeses < 12) return `há ${diffMeses} ${diffMeses === 1 ? "mês" : "meses"}`;

  const diffAnos = Math.round(diffMeses / 12);
  return `há ${diffAnos} ${diffAnos === 1 ? "ano" : "anos"}`;
}
