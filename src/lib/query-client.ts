import { QueryClient } from "@tanstack/react-query";

/**
 * Cliente único do React Query para o app inteiro.
 * Configuração pensada para telas de painel: dado fica "fresco" por
 * 30s (evita refetch em excesso ao navegar entre abas/telas), uma
 * tentativa de retry em caso de falha, e sem refetch automático ao
 * focar a janela (evita "pulos" de UI enquanto o usuário trabalha).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
