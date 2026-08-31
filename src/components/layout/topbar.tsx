import { Menu, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useLocation } from "react-router-dom";

import { NAV_ITEMS } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { sair, useSessao } from "@/lib/auth";

function currentPageTitle(pathname: string): string {
  const match = NAV_ITEMS.find((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  );
  return match?.label ?? "Viviane Braga";
}

interface TopbarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenMobileMenu: () => void;
}

export function Topbar({ collapsed, onToggleCollapsed, onOpenMobileMenu }: TopbarProps) {
  const sessao = useSessao();
  const email = sessao?.user.email ?? null;
  // Iniciais do e-mail: "joao.ferreira@x.com" -> "JF". Sem e-mail, "??".
  const iniciais = (email?.split("@")[0].split(/[._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "??").toUpperCase();
  const location = useLocation();
  const title = currentPageTitle(location.pathname);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-background px-4">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={onOpenMobileMenu}
        aria-label="Abrir menu de navegação"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      <h1 className="truncate font-display text-base font-semibold text-foreground">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input type="search" placeholder="Buscar..." className="w-56 pl-8" />
        </div>

        <ThemeToggle />

        <Separator orientation="vertical" className="h-6" />

        <Avatar className="h-8 w-8" title={email ?? undefined}>
          <AvatarFallback>{iniciais}</AvatarFallback>
        </Avatar>

        <Button variant="ghost" size="sm" onClick={() => void sair()}>
          Sair
        </Button>
      </div>
    </header>
  );
}
