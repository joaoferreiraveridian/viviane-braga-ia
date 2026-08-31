import { Component, type ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorFallbackProps {
  titulo?: string;
  descricao?: string;
}

function ErrorFallback({
  titulo = "Algo deu errado",
  descricao = "Ocorreu um erro inesperado ao carregar esta parte da aplicação.",
}: ErrorFallbackProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h1 className="font-display text-xl text-foreground">{titulo}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{descricao}</p>
      </div>
      <Button onClick={() => window.location.reload()}>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Recarregar
      </Button>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Boundary de erro de render em nível de componente. Use em torno de
 * qualquer subárvore que possa falhar de forma isolada (um card de
 * dashboard, um widget) para não derrubar a tela inteira.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorFallback />;
    }
    return this.props.children;
  }
}

/**
 * errorElement de rota do react-router. Diferencia erros de resposta HTTP
 * (404/500 lançados via loader) de erros de render genéricos.
 */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorFallback
        titulo={`Erro ${error.status}`}
        descricao={error.statusText || "Não foi possível carregar esta página."}
      />
    );
  }

  return <ErrorFallback />;
}
