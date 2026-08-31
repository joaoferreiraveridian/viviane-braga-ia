import { useEffect } from "react";

/**
 * Define o título da aba do navegador enquanto a página estiver montada,
 * sempre com o nome do app como sufixo. Restaura o título anterior ao
 * desmontar (útil ao navegar entre telas via router).
 *
 * Exemplo: usePageTitle("Registros") -> "Registros · Viviane Braga"
 */
export function usePageTitle(title: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} · Viviane Braga`;

    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
