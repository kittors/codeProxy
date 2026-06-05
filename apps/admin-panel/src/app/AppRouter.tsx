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
          <Suspense>
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
                    <Suspense>
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
