import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

/**
 * Campo de busca com ícone, debounce embutido e botão de limpar.
 * `onValueChange` só é chamado `debounceMs` depois que o usuário para
 * de digitar (ou imediatamente ao limpar).
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder = "Buscar...",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const debouncedDraft = useDebounce(draft, debounceMs);

  useEffect(() => {
    if (debouncedDraft !== value) {
      onValueChange(debouncedDraft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft]);

  useEffect(() => {
    setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleClear() {
    setDraft("");
    onValueChange("");
  }

  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-9"
      />
      {draft.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
          onClick={handleClear}
          aria-label="Limpar busca"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
