import { Suspense, useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@app/providers/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@app/layout/DashboardLayout";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { AutoUpdatePrompt } from "@app/update/AutoUpdatePrompt";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { pageRoutes, type PageRoute } from "@pages/registry";
import { ForbiddenPage } from "@pages/forbidden/ForbiddenPage";
import { EmbedPage } from "@pages/embed/EmbedPage";

const RouteFallback = () => null;

/** Preserve deep-link suffixes when remapping legacy flat routes to nested secondary routes. */
function PrefixRedirect({ fromPrefix, toPrefix }: { fromPrefix: string; toPrefix: string }) {
  const location = useLocation();
  const rest = location.pathname.startsWith(fromPrefix)
    ? location.pathname.slice(fromPrefix.length)
    : "";
  return <Navigate to={`${toPrefix}${rest}${location.search}${location.hash}`} replace />;
}

/** Legacy first-level page paths remapped under group prefixes. */
const LEGACY_PREFIX_REDIRECTS: ReadonlyArray<{ fromPrefix: string; toPrefix: string }> = [
  { fromPrefix: "/ai-providers", toPrefix: "/access/ai-providers" },
  { fromPrefix: "/monitor/request-logs", toPrefix: "/runtime/request-logs" },
  { fromPrefix: "/monitor", toPrefix: "/runtime/monitor" },
  { fromPrefix: "/logs", toPrefix: "/runtime/logs" },
  { fromPrefix: "/api-keys", toPrefix: "/access/api-keys" },
  { fromPrefix: "/ccswitch-import-settings", toPrefix: "/access/ccswitch-import-settings" },
  { fromPrefix: "/image-generation", toPrefix: "/models/image-generation" },
  { fromPrefix: "/channel-groups", toPrefix: "/models/channel-groups" },
  { fromPrefix: "/proxies", toPrefix: "/models/proxies" },
  { fromPrefix: "/tenants", toPrefix: "/governance/tenants" },
  { fromPrefix: "/users", toPrefix: "/governance/users" },
  { fromPrefix: "/roles", toPrefix: "/governance/roles" },
  { fromPrefix: "/audit-logs", toPrefix: "/governance/audit-logs" },
  { fromPrefix: "/account-security", toPrefix: "/system/account-security" },
  { fromPrefix: "/api-key-permissions", toPrefix: "/system/api-key-permissions" },
  { fromPrefix: "/menu-management", toPrefix: "/system/menu-management" },
  { fromPrefix: "/config", toPrefix: "/system/config" },
  // Do not prefix-redirect "/system" or "/models": new secondary routes already live under those bases
  // (/system/config, /models/catalog). Exact legacy remaps stay on each page route's redirects.
];

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

function menuChainEnabled(
  menus: Array<{ code: string; parent_code: string; path: string; enabled: boolean }> | undefined,
  path: string,
) {
  if (!menus?.length) return true;
  const byCode = new Map(menus.map((item) => [item.code, item]));
  const menu = menus.find((item) => item.path === path);
  if (!menu) return true;
  let current: (typeof menu) | undefined = menu;
  while (current) {
    if (!current.enabled) return false;
    current = current.parent_code ? byCode.get(current.parent_code) : undefined;
  }
  return true;
}

function AuthorizedPage({ route }: { route: PageRoute }) {
  const { can, state } = useAuth();
  if (route.requiredPermission && !can(route.requiredPermission)) return <ForbiddenPage />;
  if (!menuChainEnabled(state.principal?.menus, route.path)) return <ForbiddenPage />;
  return readyRoute(route.element);
}

function AuthorizedEmbedPage({ path }: { path: string }) {
  const { state } = useAuth();
  if (!menuChainEnabled(state.principal?.menus, path)) return <ForbiddenPage />;
  return readyRoute(<EmbedPage />);
}

/** Must render Routes itself so embed <Route>s are direct children of <Routes>. */
function AuthenticatedRoutes() {
  const { state } = useAuth();
  const routes = pageRoutes;
  const publicRoutes = routes.filter((r) => !r.auth);
  const authStandaloneRoutes = routes.filter((r) => r.auth && r.layout === "standalone");
  const authDashboardRoutes = routes.filter((r) => r.auth && r.layout === "dashboard");
  const embedMenus = useMemo(
    () =>
      state.principal?.menus?.filter(
        (menu) => menu.type === "embed" && menu.path && menu.enabled && menu.visible,
      ) ?? [],
    [state.principal?.menus],
  );

  return (
    <>
      <AutoUpdatePrompt />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {publicRoutes.flatMap((route) =>
            (route.redirects ?? []).map((rd) => (
              <Route key={rd.from} path={rd.from} element={<Navigate to={rd.to} replace />} />
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
                  <Route key={rd.from} path={rd.from} element={<Navigate to={rd.to} replace />} />
                )),
              )}
              {/* Prefix redirects cover deep links under legacy flat paths (e.g. /ai-providers/openai). */}
              {LEGACY_PREFIX_REDIRECTS.map((rd) => (
                <Route
                  key={`legacy:${rd.fromPrefix}`}
                  path={`${rd.fromPrefix}/*`}
                  element={<PrefixRedirect fromPrefix={rd.fromPrefix} toPrefix={rd.toPrefix} />}
                />
              ))}
              {embedMenus.map((menu) => (
                <Route
                  key={`embed:${menu.code}`}
                  path={menu.path}
                  element={<AuthorizedEmbedPage path={menu.path} />}
                />
              ))}
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
    </>
  );
}

export function AppRouter() {
  const routes = pageRoutes;
  const publicRoutes = routes.filter((r) => !r.auth);
  const loginRoute = publicRoutes.find((r) => r.path === "/login");
  const standalonePublicRoutes = publicRoutes.filter((r) => r.path !== "/login");

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="font-sans antialiased">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
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

              <Route
                path="*"
                element={
                  <AuthProvider>
                    <AuthenticatedRoutes />
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
