import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";

const LazyAppShell = lazy(() => import("./AppShell").then((m) => ({ default: m.AppShell })));

function ShellFallback() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700 dark:bg-neutral-950 dark:text-white/80"
    >
      <span
        aria-hidden="true"
        className="h-6 w-6 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white"
      />
    </div>
  );
}

export function DashboardLayout() {
  const location = useLocation();
  const auth = useOptionalAuth();

  return (
    <Suspense fallback={<ShellFallback />}>
      <LazyAppShell onLogout={() => auth?.actions?.logout?.()}>
        <Reveal key={location.pathname}>
          <Outlet />
        </Reveal>
      </LazyAppShell>
    </Suspense>
  );
}
