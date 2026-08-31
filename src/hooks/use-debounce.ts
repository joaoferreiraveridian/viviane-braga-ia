import { useEffect, useState } from "react";

/**
 * Retorna uma versão "atrasada" de um valor, que só atualiza depois
 * que ele para de mudar por `delayMs`. Uso típico: campo de busca que
 * dispara uma query só depois que o usuário parou de digitar.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
