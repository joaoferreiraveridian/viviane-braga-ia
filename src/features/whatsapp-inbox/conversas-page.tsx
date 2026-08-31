import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationPanel } from "./conversation-panel";

/**
 * Busca a instância de WhatsApp da empresa (hoje só uma) para alimentar
 * `ConversationPanel`. Sem Supabase configurado (falta `VITE_SUPABASE_ANON_KEY`)
 * ou sem nenhuma linha ainda em `whatsapp_instancias`, devolve `null` — a
 * página abre em estado vazio, nunca quebrada.
 */
function useInstanciaWhatsapp() {
  return useQuery({
    queryKey: ["whatsapp_instancias", "principal"],
    queryFn: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase.from("whatsapp_instancias").select("id").limit(1).maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
  });
}

export default function ConversasPage() {
  const { data: instancia, isLoading, isError, refetch } = useInstanciaWhatsapp();

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar a instância de WhatsApp.</p>
        <button type="button" onClick={() => refetch()} className="text-sm font-medium text-foreground underline underline-offset-4">
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!instancia) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma instância de WhatsApp conectada ainda.</p>
        <p className="text-sm text-muted-foreground">As conversas aparecem aqui assim que a instância for cadastrada.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8.5rem)]">
      <ConversationPanel instanciaId={instancia.id} />
    </div>
  );
}
