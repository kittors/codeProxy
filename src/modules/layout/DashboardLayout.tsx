import { lazy, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Reveal } from "@/modules/ui/Reveal";

const LazyAppShell = lazy(() =>
  import("@/modules/ui/AppShell").then((m) => ({ default: m.AppShell })),
);

export function DashboardLayout() {
  const location = useLocation();
  return (
    <Suspense>
      <LazyAppShell>
        <Reveal key={location.pathname}>
          <Outlet />
        </Reveal>
      </LazyAppShell>
    </Suspense>
  );
}
