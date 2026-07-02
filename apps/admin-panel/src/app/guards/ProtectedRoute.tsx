import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@app/providers/AuthProvider";
import { PageLoader } from "@code-proxy/ui";

export function ProtectedRoute() {
  const location = useLocation();
  const {
    state: { isAuthenticated, isRestoring },
  } = useAuth();

  if (isRestoring) {
    return <PageLoader variant="restoring" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
