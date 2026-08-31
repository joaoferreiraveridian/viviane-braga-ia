import { useCallback, useEffect, useState } from "react";

/**
 * Estado sincronizado com localStorage, com a mesma assinatura de
 * useState (valor + setter). O setter aceita valor direto ou função
 * atualizadora, igual ao setState do React.
 *
 * Seguro para SSR: se `window` não existir, cai no `initialValue`.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const readValue = useCallback((): T => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const setValue = useCallback(
    (value: T | ((previous: T) => T)) => {
      setStoredValue((previous) => {
        const nextValue =
          value instanceof Function ? value(previous) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(nextValue));
        } catch {
          // Armazenamento indisponível (modo privado, quota etc.) — ignora.
        }
        return nextValue;
      });
    },
    [key],
  );

  useEffect(() => {
    setStoredValue(readValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [storedValue, setValue];
}
