import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { hasAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { PageLoader } from "@code-proxy/ui";

export function ProtectedRoute() {
  const location = useLocation();
  const {
    state: { isAuthenticated, isRestoring, principal },
  } = useAuth();

  if (isRestoring) {
    if (hasAppLoader()) return null;
    return <PageLoader variant="restoring" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (principal?.user.must_change_password && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}
