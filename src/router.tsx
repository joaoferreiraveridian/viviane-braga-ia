import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/app-shell";
import { RouteError } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";

const ConversasPage = lazy(() => import("@/features/whatsapp-inbox/conversas-page"));
const AgentesPage = lazy(() => import("@/features/agentes/agentes-page").then((m) => ({ default: m.AgentesPage })));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function PageFallback() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/conversas" replace /> },
      { path: "conversas", element: withSuspense(<ConversasPage />) },
      { path: "agentes", element: withSuspense(<AgentesPage />) },
      { path: "*", element: withSuspense(<NotFoundPage />) },
    ],
  },
]);
