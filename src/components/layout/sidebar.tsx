import type { LucideIcon } from "lucide-react";
import { Bot, MessageCircle } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Catálogo de navegação da sidebar: as duas telas de operação do agente de WhatsApp. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Conversas", to: "/conversas", icon: MessageCircle },
  { label: "Agentes", to: "/agentes", icon: Bot },
];

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
              isActive && "bg-accent/15 text-accent",
              collapsed && "justify-center px-0",
            )
          }
          title={collapsed ? item.label : undefined}
        >
          <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

interface SidebarProps {
  collapsed: boolean;
}

/**
 * Sidebar fixa de desktop. A versão mobile (Sheet) reaproveita SidebarNav
 * diretamente em app-shell.tsx — este componente é só o casco de desktop.
 */
export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 items-center border-b border-border px-4">
        <span
          className={cn(
            "font-display text-base font-semibold text-foreground",
            collapsed && "sr-only",
          )}
        >
          Viviane Braga
        </span>
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="flex items-center gap-3 border-t border-border p-3">
        <Avatar className="h-8 w-8 shrink-0">
          {/* Placeholder de exemplo — substitua pela sessão real do usuário. */}
          <AvatarFallback>US</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">Usuário de exemplo</p>
            <p className="truncate text-xs text-muted-foreground">usuario@exemplo.com</p>
          </div>
        )}
      </div>
    </aside>
  );
}
