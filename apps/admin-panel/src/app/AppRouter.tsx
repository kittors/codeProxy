import { Suspense, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, createPath, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@app/providers/AuthProvider";
import { ProtectedRoute } from "@/app/guards/ProtectedRoute";
import { DashboardLayout } from "@app/layout/DashboardLayout";
import { AppearanceProvider, Button, ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { Icon, SatinProvider } from "satin-ui/react";
import { OnlineUpdateProvider } from "@features/online-update";
import { ChunkLoadErrorBoundary } from "@/app/bootstrap/ChunkLoadErrorBoundary";
import { dismissAppLoader } from "@/app/bootstrap/dismissAppLoader";
import { pageRoutes, type PageRoute } from "@pages/registry";
import { resolveLegacyLocation } from "@pages/routeResolution";
import { ForbiddenPage } from "@pages/forbidden/ForbiddenPage";
import { EmbedPage } from "@pages/embed/EmbedPage";

// Keep fallback empty so route transitions stay shell-only; chunk failures are
// recovered by ChunkLoadErrorBoundary / hard reload instead of a second loader.
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
  const allowed =
    !route.requiredPermission ||
    can(route.requiredPermission) ||
    (route.requiredAnyPermissions?.some((p) => can(p)) ?? false);
  if (!allowed) return <ForbiddenPage />;
  if (!menuChainEnabled(state.principal?.menus, route.path)) return <ForbiddenPage />;
  return readyRoute(route.element);
}

function AuthorizedEmbedPage({ path }: { path: string }) {
  const { state } = useAuth();
  if (!menuChainEnabled(state.principal?.menus, path)) return <ForbiddenPage />;
  return readyRoute(<EmbedPage />);
}

function StaleRoutePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center text-center">
      <div>
        <Icon name="file" className="mx-auto mb-5 text-ink-3 colorful:text-amber-500" size={48} />
        <h2 className="text-2xl font-semibold text-ink">{t("shell.stale_route_title")}</h2>
        <p className="mt-2 text-sm text-ink-2">{t("shell.stale_route_description")}</p>
        <p className="mt-2 text-xs text-ink-3">
          {t("shell.stale_route_shortcut")}
        </p>
        <Button className="mt-6" variant="primary" onClick={() => window.location.reload()}>
          {t("shell.stale_route_reload")}
        </Button>
      </div>
    </div>
  );
}

/** Must render Routes itself so embed <Route>s are direct children of <Routes>. */
function AuthenticatedRoutes() {
  const { state, can } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
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
  const embedPaths = useMemo(() => embedMenus.map((menu) => menu.path), [embedMenus]);

  // 旧地址（/auth-files、/config、/ 等）先换算成现地址，路由表直接按现地址匹配：首屏就渲染目标页，
  // 站内跳到旧地址也和普通切页一样。地址栏在提交后再换掉。
  //
  // 以前每条旧地址是布局里的一个 <Navigate> 路由，会先当成一页挂上去：页面切换动画给这个空白页
  // 走一遍入场和退场；/auth-files 这类还包在 readyRoute 里，首屏一挂上就撤掉加载层，加载层淡出后
  // 只剩空外壳，再等目标页的代码——那一拍外壳被 Suspense 换成空回退，整屏白约 0.3 秒（11-18）。
  //
  // 必须一直给 <Routes> 传 location：传与不传渲染出来的根节点不同，地址栏换成现地址的那一下
  // 会把整个布局和页面重新挂载一遍。
  const legacyTarget = useMemo(
    () => resolveLegacyLocation(location, routes, embedPaths),
    [location, routes, embedPaths],
  );
  const routeLocation = useMemo(
    () => (legacyTarget ? { ...location, ...legacyTarget } : location),
    [location, legacyTarget],
  );
  const legacyHref = legacyTarget ? createPath(legacyTarget) : null;
  useEffect(() => {
    if (legacyHref) navigate(legacyHref, { replace: true });
  }, [legacyHref, location.key, navigate]);

  // Online update is gated on the same permission its endpoints require
  // (system.status.read, per the backend's route permission table). Subscribing
  // every authenticated operator meant tenant admins polled an endpoint the server
  // refuses, forever: on a live instance that was ~28k refusals in the audit log in
  // 18 hours, from a feature those operators cannot use.
  return (
    <OnlineUpdateProvider
      enabled={state.isAuthenticated && !state.isRestoring && can("system.status.read")}
    >
      <ChunkLoadErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes location={routeLocation}>
            {/* 公开页的旧地址：目标在 AppRouter 顶层，不经这里的布局，照旧用 <Navigate>。 */}
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
                {/* 旧地址（页面的 redirects、前缀旧地址、根地址）已在上面换算成现地址，这里不再挂路由。 */}
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
                <Route path="*" element={readyRoute(<StaleRoutePage />)} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </ChunkLoadErrorBoundary>
    </OnlineUpdateProvider>
  );
}

// 遵循 Satin 官方默认视觉语言（DEFAULTS.radius = "pill"）：胶囊按钮、胶囊搜索框、
// 胶囊分段器、圆形页码与 12px/16px 清晰细描边表格/卡片；用户仍可在外观面板按需切换圆角档位。
const SATIN_NATIVE_THEME = { radius: "pill" } as const;

export function AppRouter() {
  const routes = pageRoutes;
  const publicRoutes = routes.filter((r) => !r.auth);
  const loginRoute = publicRoutes.find((r) => r.path === "/login");
  const standalonePublicRoutes = publicRoutes.filter((r) => r.path !== "/login");

  return (
    <SatinProvider theme={SATIN_NATIVE_THEME} persist>
      <ThemeProvider>
        <AppearanceProvider>
          <ToastProvider>
            <div className="font-sans antialiased">
              <ChunkLoadErrorBoundary>
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
              </ChunkLoadErrorBoundary>
            </div>
          </ToastProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </SatinProvider>
  );
}
