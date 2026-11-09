import type { Page } from "@playwright/test";

/**
 * 用「空但结构完整」的管理端接口打开一个管理页：已登录的超级管理员，所有 /v0 接口返回空列表，
 * 几个直接读字段的接口（系统监控、仪表盘）给出全零结构，页面能渲染、内容量最小。
 *
 * 逐页检查布局的用例共用它（页面底部留白、控件描边不被裁剪）。
 */

/** 管理端的全部页面（不含登录、改密和门户页），按侧边栏顺序。 */
export const ADMIN_PAGE_ROUTES = [
  "/dashboard",
  "/runtime/monitor",
  "/runtime/request-logs",
  "/runtime/logs",
  "/runtime/privacy-masking",
  "/runtime/system",
  "/access/ai-providers",
  "/access/ai-accounts",
  "/access/end-users",
  "/access/api-key-permissions",
  "/access/content-moderation",
  "/access/ccswitch-import-settings",
  "/access/api-keys",
  "/models/plaza",
  "/models/catalog",
  "/models/image-generation",
  "/models/video-generation",
  "/models/channel-groups",
  "/models/proxies",
  "/governance/tenants",
  "/governance/users",
  "/governance/roles",
  "/governance/audit-logs",
  "/governance/ip-access",
  "/system/config",
  "/system/alerts",
  "/system/menu-management",
  "/identity-fingerprint",
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

export const openEmptyAdminPage = async (page: Page, route: string) => {
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
