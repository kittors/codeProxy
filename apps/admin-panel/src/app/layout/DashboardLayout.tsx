import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { AppShell } from "./AppShell";

export function DashboardLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const auth = useOptionalAuth();
  // Remount page content when the effective tenant changes so list/detail
  // data reloads under the new tenant header instead of keeping stale state.
  const tenantKey = auth?.state.principal?.effective_tenant?.id ?? "default";

  return (
    <AppShell onLogout={() => auth?.actions?.logout?.()}>
      <AnimatePresence mode="wait">
        <Reveal key={`${location.pathname}:${tenantKey}`} className="min-h-full">
          {outlet}
        </Reveal>
      </AnimatePresence>
    </AppShell>
  );
}
