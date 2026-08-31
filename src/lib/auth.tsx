/**
 * Portão de autenticação.
 *
 * Por que existe: o banco inteiro foi desenhado para um operador LOGADO — as
 * RLS de `whatsapp_instancias/conversas/mensagens` só liberam `SELECT` para
 * `authenticated`, e o schema `api` (as duas RPC da aba Execuções e as views)
 * só dá `USAGE`/`execute` para `authenticated` (migração 0005). O frontend
 * nascera sem login e rodava como `anon`, então:
 *
 *   - Conversas recebia HTTP 200 com `[]` — RLS não dá erro, só esconde a
 *     linha — e concluía "nenhuma instância conectada" com a instância lá;
 *   - Agentes recebia `42501 permission denied for schema api`.
 *
 * A alternativa seria abrir tudo para `anon`, mas a anon key vai embutida no
 * bundle e vale de qualquer lugar da internet: seria publicar as conversas
 * dos clientes do escritório. Login é o desenho que o banco já assume.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const SessaoContext = createContext<Session | null>(null);

/** Sessão do operador logado. `null` fora do portão (não acontece na prática). */
export function useSessao() {
  return useContext(SessaoContext);
}

export async function sair() {
  await supabase?.auth.signOut();
}

function Centralizado({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function FormularioDeLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!supabase) return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      // "Invalid login credentials" é o retorno para e-mail inexistente E
      // senha errada — de propósito, para não confirmar quais e-mails existem.
      setErro(
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : `Não deu para entrar: ${error.message}`
      );
      setEnviando(false);
    }
    // Em caso de sucesso não mexemos no estado: `onAuthStateChange` troca a
    // tela inteira e este componente sai do DOM.
  }

  return (
    <Centralizado>
      <form onSubmit={entrar} className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-semibold">Viviane Braga</h1>
          <p className="text-sm text-muted-foreground">Entre para ver as conversas e o agente.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="senha">Senha</Label>
          <Input
            id="senha"
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </div>

        {erro ? (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </Centralizado>
  );
}

/**
 * Envolve o app inteiro: enquanto não há sessão, mostra o login; com sessão,
 * renderiza `children` e publica a sessão via contexto.
 */
export function PortaoDeAutenticacao({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setCarregando(false);
      return;
    }
    // getSession lê o token já persistido no localStorage (login não se perde
    // no F5); onAuthStateChange cobre login, logout e refresh de token.
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      setCarregando(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <Centralizado>
        <p className="text-sm text-muted-foreground">
          Supabase não configurado: faltam <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> no <code>.env</code>.
        </p>
      </Centralizado>
    );
  }

  if (carregando) return <Centralizado><p className="text-sm text-muted-foreground">Carregando…</p></Centralizado>;
  if (!sessao) return <FormularioDeLogin />;

  return <SessaoContext.Provider value={sessao}>{children}</SessaoContext.Provider>;
}
