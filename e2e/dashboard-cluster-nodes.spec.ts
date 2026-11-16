import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 仪表盘的「服务器节点」：新后端在 GET /config 的 capabilities 里声明 node-metrics，并在
 * GET /cluster 里给每个节点带资源快照，面板每台一张卡；没声明的旧后端连 /cluster 都不请求；
 * 声明了却答 404 的（请求落到没有这个接口的节点）不报错、停止轮询。接口全部 mock，不需要后端。
 */

const NOW = Date.now();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const snapshot = (over: Record<string, unknown> = {}) => ({
  schema: 1,
  collected_at: iso(-2_000),
  version: "dev-1234567",
  started_at: iso(-3 * 3_600_000),
  gomaxprocs: 7,
  goroutines: 812,
  host: {
    cpus: 8,
    cpu: {
      window_seconds: 5,
      busy_cores: 0.76,
      steal_cores: 2.76,
      iowait_cores: 0.02,
      idle_cores: 4.46,
    },
    load: { load1: 6.5, load5: 6.1, load15: 5.8 },
    memory: { total_bytes: 8 * 1024 ** 3, available_bytes: 2 * 1024 ** 3 },
  },
  cgroup: {
    path: "/system.slice/clirelay2-8318.service",
    cpu: {
      usage_usec: 1,
      nr_periods: 1,
      nr_throttled: 0,
      throttled_usec: 0,
      quota_cores: 7,
      window: { seconds: 5, usage_cores: 2.55, throttled_ratio: 0.12, throttled_seconds: 0.3 },
    },
    memory: { current_bytes: 1.5 * 1024 ** 3, high_bytes: 3 * 1024 ** 3, max_bytes: 4 * 1024 ** 3 },
  },
  traffic: {
    in_flight: 120,
    window_seconds: 60,
    requests: 840,
    bytes_in: 60 * 1024 * 1024,
    bytes_out: 6 * 1024 * 1024,
  },
  egress: {
    breaker_enabled: true,
    breaker_open: 0,
    auth_rejected: 0,
    unreachable: 0,
    check: { total: 4, unreachable: 0 },
  },
  db: { rtt_ms: 8.2 },
  redis: { role: "cluster", rtt_ms: 7.9 },
  ...over,
});

const newBackendCluster = {
  enabled: true,
  node_id: "n155",
  is_leader: true,
  active_nodes: 2,
  nodes: [
    {
      node_id: "n149",
      version: "dev-1234567",
      advertise: "149.104.0.173",
      started_at: iso(-3_600_000),
      last_seen: iso(-3_000),
      leader: false,
      active: true,
      self: false,
      snapshot: snapshot({
        egress: { breaker_enabled: true, breaker_open: 1, auth_rejected: 1, unreachable: 0 },
      }),
      snapshot_at: iso(-3_000),
    },
    {
      node_id: "n155",
      version: "dev-1234567",
      advertise: "103.42.31.155",
      started_at: iso(-3 * 3_600_000),
      last_seen: iso(-2_000),
      leader: true,
      active: true,
      self: true,
      snapshot: snapshot(),
      snapshot_at: iso(-2_000),
    },
    {
      node_id: "n43",
      version: "dev-0000000",
      advertise: "43.255.122.4",
      started_at: iso(-86_400_000),
      last_seen: iso(-10 * 60_000),
      leader: false,
      active: false,
      self: false,
    },
  ],
};

const tenant = {
  id: "t-system",
  slug: "system",
  name: "System Administration",
  type: "system",
  status: "active",
  effective_status: "active",
  expires_at: null,
  description: "",
  version: 1,
  created_at: "",
  updated_at: "",
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** 打开仪表盘；cluster 决定 GET /cluster 怎么答，返回它被请求的次数。 */
const DECLARED = { "node-metrics": true };

const openDashboard = async (
  page: Page,
  cluster: (route: Route) => Promise<void>,
  capabilities: Record<string, boolean> = DECLARED,
) => {
  const calls = { cluster: 0 };
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60 * 60_000,
      }),
    );
    localStorage.setItem(
      "cli-proxy-language",
      JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }),
    );
  });
  await page.route("**/v0/auth/me", (route) =>
    json(route, {
      principal: {
        kind: "user_session",
        user: {
          id: "u-admin",
          tenant_id: "t-system",
          username: "admin",
          display_name: "管理员",
          status: "active",
          must_change_password: false,
          last_login_at: null,
          role_ids: [],
          role_codes: [],
          version: 1,
          created_at: "",
          updated_at: "",
        },
        home_tenant: tenant,
        effective_tenant: tenant,
        roles: [],
        permissions: ["dashboard.read", "system.status.read"],
        platform_admin: true,
      },
    }),
  );
  // Playwright 先试最后注册的路由：兜底要最先注册，免得盖住具体的。
  await page.route("**/v0/management/**", (route) =>
    json(route, { items: [], data: [], total: 0 }),
  );
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/config")) {
      return json(route, { capabilities });
    }
    if (url.pathname.endsWith("/cluster")) {
      calls.cluster++;
      return cluster(route);
    }
    if (url.pathname.endsWith("/system-stats")) {
      return json(route, {
        db_size_bytes: 0,
        log_content_store_bytes: 0,
        log_dir_size_bytes: 0,
        log_size_bytes: 0,
        process_mem_bytes: 0,
        process_mem_pct: 0,
        process_cpu_pct: 0,
        go_routines: 0,
        go_heap_bytes: 0,
        system_cpu_pct: 0,
        system_mem_total: 0,
        system_mem_used: 0,
        system_mem_pct: 0,
        net_bytes_sent: 0,
        net_bytes_recv: 0,
        net_send_rate: 0,
        net_recv_rate: 0,
        disk_total: 0,
        disk_used: 0,
        disk_free: 0,
        disk_pct: 0,
        uptime_seconds: 0,
        start_time: new Date(0).toISOString(),
        channel_latency: [],
        active_concurrency: [],
        total_in_flight: 0,
        total_rpm: 0,
        total_tpm: 0,
      });
    }
    if (url.pathname.endsWith("/dashboard-summary")) {
      return json(route, {
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
        counts: { api_keys: 0 },
        days: 7,
      });
    }
    return route.fallback();
  });
  await page.goto("/#/dashboard");
  await expect(page.getByRole("heading", { name: "系统监控" })).toBeVisible();
  return calls;
};

test("每台节点一张卡，CPU 的执行与 steal 分开，slot 配额与出口状态都在", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDashboard(page, (route) => json(route, newBackendCluster));

  await expect(page.getByRole("heading", { name: "服务器节点" })).toBeVisible();
  await expect(page.getByText("2 / 3 在线")).toBeVisible();

  const self = page.getByRole("group", { name: "n155" });
  await expect(self.getByText("主节点")).toBeVisible();
  await expect(self.getByText("当前节点")).toBeVisible();
  await expect(self.getByText("CPU · 8 核")).toBeVisible();
  await expect(
    self.getByRole("img", { name: "执行 0.76 核，steal 2.76 核，共 8 核" }),
  ).toBeVisible();
  await expect(self.getByText("steal 占想运行时间的 78%")).toBeVisible();
  await expect(self.getByText("7.00 核")).toBeVisible();
  await expect(self.getByText("12%")).toBeVisible();
  await expect(self.getByText("共享 Redis 往返")).toBeVisible();

  await expect(page.getByRole("group", { name: "n149" }).getByText("熔断 1 个代理")).toBeVisible();
  const offline = page.getByRole("group", { name: "n43" });
  await expect(offline.getByText("离线")).toBeVisible();
  await expect(offline.getByText(/还没有上报资源数据/)).toBeVisible();

  // 三张卡在 1280 宽下并排或分两行都可以，但都得完整落在分区里，不能被挤出去。
  const section = page
    .getByRole("heading", { name: "服务器节点" })
    .locator("xpath=ancestor::section[1]");
  const sectionBox = await section.boundingBox();
  for (const name of ["n149", "n155", "n43"]) {
    const box = await page.getByRole("group", { name }).boundingBox();
    expect(box && sectionBox).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1);
  }
});

test("旧后端没有在 /config 里声明 node-metrics：不请求 /cluster，也不显示节点视图", async ({
  page,
}) => {
  const calls = await openDashboard(
    page,
    (route) =>
      json(route, {
        enabled: false,
        node_id: "hk-155",
        is_leader: true,
        active_nodes: 1,
        nodes: [
          {
            node_id: "hk-155",
            started_at: iso(0),
            last_seen: iso(0),
            leader: true,
            active: true,
            self: true,
          },
        ],
      }),
    { alerts: true, "pool-capacity": true },
  );
  await page.waitForTimeout(3_000);
  expect(calls.cluster).toBe(0);
  await expect(page.getByRole("heading", { name: "服务器节点" })).toHaveCount(0);
});

test("声明了能力、/cluster 却答 404：不报错，节点视图不出现，也不再轮询", async ({ page }) => {
  test.setTimeout(45_000);
  const calls = await openDashboard(page, (route) => json(route, { error: "not found" }, 404));
  await expect.poll(() => calls.cluster).toBeGreaterThan(0);
  // 开发模式下 StrictMode 会把挂载时的请求发两次；要看的是之后不再轮询。轮询间隔是 10 秒，
  // 多等一会儿确认次数不再增加。
  await page.waitForTimeout(1_000);
  const answered = calls.cluster;
  await page.waitForTimeout(11_000);
  expect(calls.cluster).toBe(answered);
  await expect(page.getByRole("heading", { name: "服务器节点" })).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
