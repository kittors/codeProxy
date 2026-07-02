import { Outlet, useLocation } from "react-router-dom";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { AppShell } from "./AppShell";

export function DashboardLayout() {
  const location = useLocation();
  const auth = useOptionalAuth();

  return (
    <AppShell onLogout={() => auth?.actions?.logout?.()}>
      <Reveal key={location.pathname}>
        <Outlet />
      </Reveal>
    </AppShell>
  );
}
