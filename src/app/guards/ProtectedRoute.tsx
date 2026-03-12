import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/modules/auth/AuthProvider";
import { PageBackground } from "@/modules/ui/PageBackground";

export function ProtectedRoute() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    state: { isAuthenticated, isRestoring },
  } = useAuth();

  if (isRestoring) {
    return (
      <PageBackground variant="app">
        <div className="flex min-h-screen items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-6 py-4 text-sm text-slate-700 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
            {t("common.restoring_session")}
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
