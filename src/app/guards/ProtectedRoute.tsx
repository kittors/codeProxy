import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PageBackground } from "@/modules/ui/PageBackground";

export function ProtectedRoute() {
  const location = useLocation();
  const {
    state: { isAuthenticated, isRestoring },
  } = useAuth();

  if (isRestoring) {
    return (
      <PageBackground variant="app">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex flex-col items-center animate-[fadeInUp_0.5s_ease-out]">
            <div className="relative mb-6">
              <div className="h-12 w-12 rounded-full border-[3px] border-indigo-500/15 dark:border-indigo-400/15" />
              <div className="absolute inset-0 h-12 w-12 rounded-full border-[3px] border-transparent border-t-indigo-500/60 dark:border-t-indigo-400/70 animate-spin" />
            </div>
            <span className="text-[13px] font-medium tracking-wider text-slate-400 dark:text-white/40 animate-pulse">
              CLI Proxy
            </span>
          </div>
        </div>
      </PageBackground>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
