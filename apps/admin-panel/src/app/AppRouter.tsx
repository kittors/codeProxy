import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@app/providers/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@app/layout/DashboardLayout";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { AutoUpdatePrompt } from "@app/update/AutoUpdatePrompt";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { pageRoutes, type PageRoute } from "@pages/registry";
import { ForbiddenPage } from "@pages/forbidden/ForbiddenPage";

const RouteFallback = () => null;

function InitialRouteReady({ children }: { children: React.ReactElement }) {
  useEffect(() => {
    dismissAppLoader(false);
  }, []);

  return children;
}

function LoginRouteReady({ children }: { children: React.ReactElement }) {
  const {
    state: { isAuthenticated, isRestoring },
  } = useAuth();

  useEffect(() => {
    if (!isRestoring && !isAuthenticated) {
      dismissAppLoader(false);
    }
  }, [isAuthenticated, isRestoring]);

  return children;
}

const readyRoute = (element: React.ReactElement) => (
  <InitialRouteReady>{element}</InitialRouteReady>
);

function AuthorizedPage({ route }: { route: PageRoute }) {
  const { can } = useAuth();
  if (route.requiredPermission && !can(route.requiredPermission)) return <ForbiddenPage />;
  return readyRoute(route.element);
}

export function AppRouter() {
  const routes = pageRoutes;
  const publicRoutes = routes.filter((r) => !r.auth);
  const loginRoute = publicRoutes.find((r) => r.path === "/login");
  const standalonePublicRoutes = publicRoutes.filter((r) => r.path !== "/login");
  const authStandaloneRoutes = routes.filter((r) => r.auth && r.layout === "standalone");
  const authDashboardRoutes = routes.filter((r) => r.auth && r.layout === "dashboard");

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="font-sans antialiased">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public routes */}
              {standalonePublicRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={readyRoute(route.element)} />
              ))}
              {loginRoute ? (
                <Route
                  path={loginRoute.path}
                  element={
                    <AuthProvider>
                      <LoginRouteReady>{loginRoute.element}</LoginRouteReady>
                    </AuthProvider>
                  }
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
                          {authStandaloneRoutes.map((route) => (
                            <Route
                              key={route.path}
                              path={route.path}
                              element={<AuthorizedPage route={route} />}
                            />
                          ))}
                          <Route element={<DashboardLayout />}>
                            {authDashboardRoutes.map((route) => (
                              <Route
                                key={route.path}
                                path={route.path}
                                element={<AuthorizedPage route={route} />}
                              />
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
                                  element={<AuthorizedPage route={route} />}
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
