import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@app/providers/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@app/layout/DashboardLayout";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { AutoUpdatePrompt } from "@app/update/AutoUpdatePrompt";
import { pageRoutes } from "@pages/registry";

interface RouteWithMeta {
  path: string;
  element: React.ReactElement;
  auth: boolean;
  layout: string;
  nav: { labelKey: string } | null;
  redirects?: Array<{ from: string; to: string }>;
  hasWildcard?: boolean;
}

function RouteFallback() {
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

export function AppRouter() {
  const routes = pageRoutes as RouteWithMeta[];
  const publicRoutes = routes.filter((r) => !r.auth);
  const loginRoute = publicRoutes.find((r) => r.path === "/login");
  const standalonePublicRoutes = publicRoutes.filter((r) => r.path !== "/login");
  const authDashboardRoutes = routes.filter((r) => r.auth && r.layout === "dashboard");

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="font-sans antialiased">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public routes */}
              {standalonePublicRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              {loginRoute ? (
                <Route
                  path={loginRoute.path}
                  element={<AuthProvider>{loginRoute.element}</AuthProvider>}
                />
              ) : null}

              {/* Auth-protected routes */}
              <Route
                path="*"
                element={
                  <AuthProvider>
                    <AutoUpdatePrompt />
                    <Suspense fallback={<RouteFallback />}>
                      <Routes>
                        {publicRoutes.map((route) =>
                          route.redirects?.map((rd) => (
                            <Route
                              key={rd.from}
                              path={rd.from}
                              element={<Navigate to={rd.to} replace />}
                            />
                          )),
                        )}
                        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
                        <Route element={<ProtectedRoute />}>
                          <Route element={<DashboardLayout />}>
                            {authDashboardRoutes.map((route) => (
                              <Route key={route.path} path={route.path} element={route.element} />
                            ))}
                            {authDashboardRoutes.flatMap((route) =>
                              (route.redirects ?? []).map((rd) => (
                                <Route
                                  key={rd.from}
                                  path={rd.from}
                                  element={<Navigate to={rd.to} replace />}
                                />
                              )),
                            )}
                            {/* Wildcard for /ai-providers/* */}
                            {authDashboardRoutes
                              .filter((r) => r.hasWildcard)
                              .map((route) => (
                                <Route
                                  key={`${route.path}-wildcard`}
                                  path={`${route.path}/*`}
                                  element={route.element}
                                />
                              ))}
                            <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          </Route>
                        </Route>
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Suspense>
                  </AuthProvider>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
