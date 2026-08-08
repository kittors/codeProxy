import { expect, test, type Page } from "@playwright/test";

/**
 * 页面底部留白必须和其余三边一致。
 *
 * 外层 <main> 给了四边等距的内边距，所以只要页面内容撑满 main 的内容盒，底部看到的就正好
 * 是那一条内边距。撑不满时多出来的高度会全部堆在底部，视觉上就是「下面那条明显更宽」。
 *
 * 这里用空数据跑：内容最少、最容易撑不满，是最严格的一档。
 */

const ROUTES = [
  "/dashboard",
  "/runtime/monitor",
  "/runtime/request-logs",
  "/runtime/logs",
  "/runtime/system",
  "/access/ai-providers",
  "/access/ai-accounts",
  "/access/end-users",
  "/access/api-key-permissions",
  "/access/content-moderation",
  "/access/ccswitch-import-settings",
  "/access/api-keys",
  "/models/catalog",
  "/models/channel-groups",
  "/models/proxies",
  "/governance/tenants",
  "/governance/users",
  "/governance/roles",
  "/governance/audit-logs",
  "/system/config",
  "/system/menu-management",
] as const;

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

const openPage = async (page: Page, route: string) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });

  // 所有管理端接口一律返回「空但结构完整」的响应：页面能渲染，但内容量最小。
  await page.route("**/v0/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/auth/me")) return json({ principal });
    if (url.pathname.endsWith("/config")) return json({ config: {} });
    if (url.pathname.endsWith("/update/check")) return json({ has_update: false });
    // 系统监控卡片直接对数值调 toFixed，字段缺失会整页落进错误边界
    if (url.pathname.endsWith("/system-stats")) {
      const zeros = [
        "db_size_bytes",
        "log_content_store_bytes",
        "log_dir_size_bytes",
        "log_size_bytes",
        "process_mem_bytes",
        "process_mem_pct",
        "process_cpu_pct",
        "go_routines",
        "go_heap_bytes",
        "system_cpu_pct",
        "system_mem_total",
        "system_mem_used",
        "system_mem_pct",
        "net_bytes_sent",
        "net_bytes_recv",
        "net_send_rate",
        "net_recv_rate",
        "disk_total",
        "disk_used",
        "disk_free",
        "disk_pct",
        "uptime_seconds",
        "total_in_flight",
        "total_rpm",
        "total_tpm",
      ];
      return json({
        ...Object.fromEntries(zeros.map((key) => [key, 0])),
        start_time: new Date(0).toISOString(),
        channel_latency: [],
        active_concurrency: [],
      });
    }
    // 仪表盘直接读 kpi/counts 的字段，给不出结构会落进错误边界，量不到布局
    if (url.pathname.endsWith("/dashboard-summary")) {
      return json({
        kpi: {
          total_requests: 0,
          success_requests: 0,
          failed_requests: 0,
          success_rate: 0,
          input_tokens: 0,
          output_tokens: 0,
          reasoning_tokens: 0,
          cached_tokens: 0,
          total_tokens: 0,
          total_cost: 0,
          cache_rate: 0,
        },
        trends: {},
        counts: {
          api_keys: 0,
          providers_total: 0,
          gemini_keys: 0,
          claude_keys: 0,
          codex_keys: 0,
          vertex_keys: 0,
          openai_providers: 0,
          auth_files: 0,
        },
        days: 7,
      });
    }
    return json({
      items: [],
      files: [],
      points: [],
      logs: [],
      entries: [],
      data: [],
      results: [],
      source: [],
      auth_index: [],
      total: 0,
      config: {},
    });
  });

  await page.goto(`/#${route}`);
  await page.waitForFunction(() => {
    const main = document.getElementById("main-content");
    return Boolean(main && main.firstElementChild);
  });
};

const measure = (page: Page) =>
  page.evaluate(() => {
    const main = document.getElementById("main-content") as HTMLElement;
    const cs = getComputedStyle(main);
    const rect = main.getBoundingClientRect();
    const padBottom = parseFloat(cs.paddingBottom);
    const padLeft = parseFloat(cs.paddingLeft);

    /*
     * 量的必须是「用户看得见的那块内容」的底边，不是最外层包装层的底边。
     * 包装层（Reveal）撑满了不等于页面内容撑满了——它是透明的，内部内容矮一截时，
     * 用户照样看到底部多出一条留白。所以向下钻取，跳过没有可见表面（无背景、无边框、
     * 无阴影）的纯布局容器，直到找到真正画出东西的元素。
     */
    const paints = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || s.opacity === "0") return false;
      const bg = s.backgroundColor;
      const opaqueBg = bg !== "transparent" && !/rgba?\([^)]*,\s*0\s*\)$/.test(bg);
      // 只认元素「自己」画出来的东西：纯布局容器会被跳过，继续往下钻
      const ownsText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 0,
      );
      return (
        opaqueBg ||
        s.borderBottomWidth !== "0px" ||
        s.boxShadow !== "none" ||
        ownsText ||
        el.tagName === "IMG" ||
        el.tagName === "SVG" ||
        el.tagName === "CANVAS"
      );
    };

    const bottoms: number[] = [];
    const collect = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && paints(el)) bottoms.push(r.bottom);
      for (const kid of el.children) collect(kid);
    };
    for (const kid of main.children) collect(kid);
    const contentBottom = bottoms.length ? Math.max(...bottoms) : rect.top;
    const scroller = main.parentElement as HTMLElement;
    return {
      // >0 表示内容没撑满，这部分会叠加在底部内边距之上
      gap: Math.round(rect.bottom - padBottom - contentBottom),
      padBottom: Math.round(padBottom),
      padLeft: Math.round(padLeft),
      overflow: Math.round(scroller.scrollHeight - scroller.clientHeight),
    };
  });

test.describe("页面底部留白", () => {
  for (const route of ROUTES) {
    test(`${route} 的底部留白等于左右内边距`, async ({ page }) => {
      await openPage(page, route);

      /*
       * 轮询而不是固定 sleep：入场动画、懒加载 chunk、首屏请求各自落定的时间不一样，
       * 并发跑的时候更飘。固定等待要么不够（量到过渡中的高度，假失败），要么白等。
       * 布局真有问题时它会一直不达标，照样失败。
       */
      let last = await measure(page);
      await expect
        .poll(
          async () => {
            last = await measure(page);
            // 内容超过一屏时由外层滚动，底部不存在多余留白
            return last.overflow > 1 ? 0 : last.gap;
          },
          { timeout: 15_000 },
        )
        // 留 2px 给亚像素取整
        .toBeLessThanOrEqual(2);

      // 四边内边距本来就同源，这里顺带守住它不被单独改坏
      expect(
        last.padBottom,
        `底部留白 ${last.padBottom + last.gap}px，左右 ${last.padLeft}px`,
      ).toBe(last.padLeft);
    });
  }
});
