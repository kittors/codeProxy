import { expect, test, type Page } from "@playwright/test";

/**
 * 内容必须能被滚到。
 *
 * 外壳把高度钉死之后，页面要么自己在内部滚（表格类），要么把外层滚动容器撑开（长表单类）。
 * 两条路只要有一条断了，用户就会看到「有内容却滚不动」——这正是 request-logs 上报的现象。
 * 所以这里不检查用哪种滚法，只检查一件事：滚到底以后，最后一块内容看不看得见。
 */

const principal = {
  user_id: "u1",
  username: "admin",
  display_name: "Admin",
  tenant_id: "t1",
  tenant_slug: "system",
  is_super_admin: true,
  platform_admin: true,
  must_change_password: false,
  kind: "user",
  roles: [],
  permissions: ["*"],
  menus: [],
  effective_tenant: { id: "t1", name: "System", slug: "system", type: "system" },
  user: { display_name: "Admin", username: "admin", role_codes: ["platform_super_admin"] },
};

// 行数足够多，确保每个列表页都必须滚动才能看全
const ROWS = 60;

const usageLogs = {
  items: Array.from({ length: ROWS }, (_, i) => ({
    id: i + 1,
    timestamp: new Date(1786000000000 + i * 1000).toISOString(),
    api_key: "cps_x",
    api_key_name: `key-${i}`,
    model: "gpt-5.3",
    source: "codex",
    channel_name: "codex",
    auth_index: "a1",
    failed: false,
    latency_ms: 1200,
    input_tokens: 60,
    output_tokens: 40,
    total_tokens: 100,
    cost: 0,
    status_code: 200,
  })),
  total: ROWS,
  page: 1,
  size: ROWS,
  filters: {
    api_keys: ["cps_x"],
    api_key_names: { cps_x: "key" },
    api_key_counts: { cps_x: ROWS },
    models: ["gpt-5.3"],
    channels: ["codex"],
    channel_options: [],
    statuses: ["200"],
  },
  stats: { total: ROWS, success_rate: 1, total_tokens: 6000, total_cost: 0, cache_rate: 0 },
};

const genericRows = Array.from({ length: ROWS }, (_, i) => ({
  id: `row-${i}`,
  name: `条目-${i}`,
  username: `user${i}`,
  display_name: `用户 ${i}`,
  status: "active",
  enabled: true,
  created_at: new Date(1786000000000 + i * 1000).toISOString(),
  updated_at: new Date(1786000000000 + i * 1000).toISOString(),
  api_key_count: 1,
  actor: `user${i}`,
  action: "login",
  target: "session",
  result: "success",
}));

const ROUTES = [
  "/runtime/request-logs",
  "/runtime/logs",
  "/governance/audit-logs",
  "/governance/users",
  "/governance/roles",
  "/governance/tenants",
  "/access/end-users",
  "/access/api-keys",
  "/system/menu-management",
] as const;

const openPage = async (page: Page, route: string) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "k",
        rememberPassword: true,
        expiresAt: Date.now() + 86400000,
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/**", async (r) => {
    const u = new URL(r.request().url());
    const json = (b: unknown) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (u.pathname.endsWith("/auth/me")) return json({ principal });
    if (u.pathname.includes("logs") && !u.pathname.includes("audit")) return json(usageLogs);
    // 角色 / 菜单页会直接读这些字段，结构不全会整页落进错误边界，量不到布局
    if (u.pathname.endsWith("/roles")) {
      return json({
        items: Array.from({ length: ROWS }, (_, i) => ({
          id: `role-${i}`,
          tenant_id: "t1",
          code: `role_${i}`,
          name: `角色-${i}`,
          description: "d",
          scope: "tenant",
          system_protected: false,
          permissions: [],
          version: 1,
        })),
      });
    }
    if (u.pathname.endsWith("/permissions")) return json({ items: [] });
    if (u.pathname.endsWith("/menus")) {
      return json({
        items: Array.from({ length: ROWS }, (_, i) => ({
          id: `menu-${i}`,
          code: `menu.${i}`,
          parent_code: "",
          path: `/p/${i}`,
          title: `菜单-${i}`,
          label_key: "",
          icon: "menu",
          type: "menu",
          sort_order: i,
          enabled: true,
          visible: true,
          hide_menu: false,
          permission_code: "",
          component: "",
          link_url: "",
          version: 1,
        })),
      });
    }
    return json({
      items: genericRows,
      users: genericRows,
      roles: genericRows,
      tenants: genericRows,
      menus: genericRows,
      logs: genericRows,
      total: ROWS,
      page: 1,
      size: ROWS,
      config: {},
    });
  });
  await page.goto(`/#${route}`);
  await page.waitForFunction(() =>
    Boolean(document.getElementById("main-content")?.firstElementChild),
  );
};

/** 把页面里所有能滚的容器都推到底，然后回报最底部内容相对可视区的位置 */
const scrollToBottomAndProbe = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main-content") as HTMLElement;
    const scroller = main.parentElement as HTMLElement;

    const scrollables: HTMLElement[] = [scroller];
    main.querySelectorAll("*").forEach((el) => {
      const cs = getComputedStyle(el);
      if (/auto|scroll/.test(cs.overflowY) && el.scrollHeight - el.clientHeight > 1) {
        scrollables.push(el as HTMLElement);
      }
    });
    for (const el of scrollables) el.scrollTop = el.scrollHeight;

    // 最底部那块「画了东西」的元素
    let lowest = Number.NEGATIVE_INFINITY;
    main.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") return;
      const ownsText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      if (!ownsText) return;
      lowest = Math.max(lowest, r.bottom);
    });

    const scrollerRect = scroller.getBoundingClientRect();
    return {
      // >0 表示滚到底之后，还有内容留在可视区下方——用户永远看不到
      unreachable: Math.round(lowest - scrollerRect.bottom),
      scrollableCount: scrollables.length,
    };
  });

test.describe("内容可达性", () => {
  for (const route of ROUTES) {
    test(`${route} 滚到底后没有够不着的内容`, async ({ page }) => {
      await openPage(page, route);

      let probe = await scrollToBottomAndProbe(page);
      await expect
        .poll(
          async () => {
            probe = await scrollToBottomAndProbe(page);
            return probe.unreachable;
          },
          { timeout: 15_000 },
        )
        // 留 2px 给亚像素取整
        .toBeLessThanOrEqual(2);
    });
  }
});
