import { useState } from "react";
import { ConversationList } from "./conversation-list";
import { Thread } from "./thread";
import { Conversa } from "./types";

export function ConversationPanel({ instanciaId }: { instanciaId: string }) {
  const [conversaSelecionada, setConversaSelecionada] = useState<Conversa | null>(null);

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-border">
      <ConversationList
        instanciaId={instanciaId}
        conversaSelecionadaId={conversaSelecionada?.id ?? null}
        onSelecionar={setConversaSelecionada}
      />
      <Thread conversa={conversaSelecionada} />
    </div>
  );
}
