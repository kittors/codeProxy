import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";

const LazyAppShell = lazy(() => import("./AppShell").then((m) => ({ default: m.AppShell })));

export function DashboardLayout() {
  const location = useLocation();
  const auth = useOptionalAuth();

  return (
    <Suspense>
      <LazyAppShell onLogout={() => auth?.actions?.logout?.()}>
        <Reveal key={location.pathname}>
          <Outlet />
        </Reveal>
      </LazyAppShell>
    </Suspense>
  );
}
