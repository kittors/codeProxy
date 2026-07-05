import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Reveal } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { AppShell } from "./AppShell";

export function DashboardLayout() {
  const location = useLocation();
  const outlet = useOutlet();
  const auth = useOptionalAuth();

  return (
    <AppShell onLogout={() => auth?.actions?.logout?.()}>
      <AnimatePresence mode="wait">
        <Reveal key={location.pathname} className="min-h-full">
          {outlet}
        </Reveal>
      </AnimatePresence>
    </AppShell>
  );
}
