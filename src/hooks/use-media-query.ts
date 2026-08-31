import { useEffect, useState } from "react";

/**
 * Observa uma media query CSS e retorna se ela está ativa no momento.
 * Útil para adaptar layout/comportamento sem depender só de classes
 * responsivas do Tailwind (ex: trocar Dialog por Sheet em telas pequenas).
 *
 * Exemplo: const isDesktop = useMediaQuery("(min-width: 1024px)");
 */
export function useMediaQuery(query: string): boolean {
  const getMatch = () =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false;

  const [matches, setMatches] = useState<boolean>(getMatch);

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => setMatches(event.matches);

    setMatches(mediaQueryList.matches);
    mediaQueryList.addEventListener("change", listener);

    return () => mediaQueryList.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
