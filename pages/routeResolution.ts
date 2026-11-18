import { matchPath, matchRoutes, parsePath, type Path } from "react-router-dom";
import type { PageRoute } from "./registry";

/** 旧地址到现地址的映射，声明在目标页的路由上（PageRoute.redirects）。 */
export interface RouteRedirect {
  /** 旧路径，按路由路径的规则匹配（不分大小写，忽略末尾斜杠）。 */
  from: string;
  /** 现地址，可以带自己的查询串（如 `/access/ai-accounts?tab=alias`）。 */
  to: string;
  /** 把旧地址的查询串带过去：目标页读的还是同一组参数。`to` 自带查询串时以 `to` 为准。 */
  keepSearch?: boolean;
  /** 只在旧地址的查询串满足条件时才跳；不满足时这个路径照常是页面（如带 endUserId 的 API Key 页）。 */
  when?: (params: URLSearchParams) => boolean;
}

/** Legacy first-level page paths remapped under group prefixes; the deep-link suffix is kept. */
export const LEGACY_PREFIX_REDIRECTS: ReadonlyArray<{ fromPrefix: string; toPrefix: string }> = [
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
  { fromPrefix: "/account-security", toPrefix: "/access/ai-accounts" },
  { fromPrefix: "/system/account-security", toPrefix: "/access/ai-accounts" },
  { fromPrefix: "/api-key-permissions", toPrefix: "/access/api-key-permissions" },
  { fromPrefix: "/system/api-key-permissions", toPrefix: "/access/api-key-permissions" },
  { fromPrefix: "/menu-management", toPrefix: "/system/menu-management" },
  { fromPrefix: "/config", toPrefix: "/system/config" },
  // Do not prefix-redirect "/system" or "/models": new secondary routes already live under those bases
  // (/system/config, /models/catalog). Exact legacy remaps stay on each page route's redirects.
];

type Location = Pick<Path, "pathname" | "search" | "hash">;

type TableEntry = { path: string; redirect?: (location: Location, splat: string) => Location };

const redirectTarget = (redirect: RouteRedirect, location: Location): Location => {
  const to = parsePath(redirect.to);
  return {
    pathname: to.pathname || "/",
    search: to.search || (redirect.keepSearch ? location.search : ""),
    hash: to.hash || "",
  };
};

/** 登录后才能进的路由（外壳内的页面和独立页）；公开页的旧地址仍由 AppRouter 顶层的 <Navigate> 处理。 */
const authRoutes = (routes: readonly PageRoute[]) => routes.filter((route) => route.auth);

/**
 * 按旧版路由表的顺序排好：真实页面、无条件的旧地址、前缀旧地址、嵌入菜单、页面通配。
 * 交给 React Router 的 matchRoutes 按它自己的规则排名，和以前 <Routes> 里直接挂 <Navigate>
 * 时谁优先完全一致——旧地址不会盖住同样具体或更具体的真实页面、嵌入菜单。
 */
const buildTable = (routes: readonly PageRoute[], embedPaths: readonly string[]): TableEntry[] => {
  const pages = authRoutes(routes);
  return [
    ...pages.map((route) => ({ path: route.path })),
    ...pages.flatMap((route) =>
      (route.redirects ?? [])
        .filter((redirect) => !redirect.when)
        .map((redirect) => ({
          path: redirect.from,
          redirect: (location: Location) => redirectTarget(redirect, location),
        })),
    ),
    ...LEGACY_PREFIX_REDIRECTS.map(({ fromPrefix, toPrefix }) => ({
      path: `${fromPrefix}/*`,
      redirect: (location: Location, splat: string) => ({
        pathname: splat ? `${toPrefix}/${splat}` : toPrefix,
        search: location.search,
        hash: location.hash,
      }),
    })),
    ...embedPaths.map((path) => ({ path })),
    ...pages.filter((route) => route.hasWildcard).map((route) => ({ path: `${route.path}/*` })),
  ];
};

/**
 * 旧地址现在在哪；已经是现地址时返回 null。
 *
 * AuthenticatedRoutes 拿结果去匹配路由表：旧地址直接渲染目标页，再在提交后把地址栏换成现地址。
 * 以前每条旧地址是挂在布局里的一个 <Navigate> 路由，先当成一页挂上去（空白页的入场 / 退场动画、
 * 首屏还会提前撤掉加载层），下一拍才跳到目标页。
 */
export function resolveLegacyLocation(
  location: Location,
  routes: readonly PageRoute[],
  embedPaths: readonly string[] = [],
): Location | null {
  // 带条件的旧地址和某个真实页面同路径（裸 /access/api-keys），先于路由表判断。
  const params = new URLSearchParams(location.search);
  for (const route of authRoutes(routes)) {
    for (const redirect of route.redirects ?? []) {
      if (!redirect.when) continue;
      if (!matchPath({ path: redirect.from, end: true }, location.pathname)) continue;
      if (redirect.when(params)) return redirectTarget(redirect, location);
    }
  }

  const match = matchRoutes(buildTable(routes, embedPaths), location.pathname)?.at(-1);
  if (!match?.route.redirect) return null;
  return match.route.redirect(location, match.params["*"] ?? "");
}

/** 这个现地址由哪个页面路由渲染（和 AppRouter 一样：页面路径，以及声明了 hasWildcard 的子路径）。 */
export function matchPageRoute(pathname: string, routes: readonly PageRoute[]): PageRoute | null {
  const table = routes.flatMap((route) => [
    { path: route.path, page: route },
    ...(route.hasWildcard ? [{ path: `${route.path}/*`, page: route }] : []),
  ]);
  return matchRoutes(table, pathname)?.at(-1)?.route.page ?? null;
}
