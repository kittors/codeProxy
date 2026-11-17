import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 仪表盘的「服务器节点」：新后端在 GET /config 的 capabilities 里声明 node-metrics，并在
 * GET /cluster 里给每个节点带资源快照（含磁盘），主节点的快照带数据库，hosts 带数据库主机；面板每台
 * 节点一张紧凑卡片，数据库一张，宽屏一行放下。没声明的旧后端连 /cluster 都不请求；声明了却答 404 的
 * （请求落到没有这个接口的节点）不报错、停止轮询。接口全部 mock，不需要后端。
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
  disks: [
    {
      mount: "/",
      fs_type: "xfs",
      paths: [
        { use: "root", path: "/" },
        { use: "workdir", path: "/opt/clirelay2" },
        { use: "auth", path: "/opt/clirelay2/data/auth" },
        { use: "logs", path: "/opt/clirelay2/logs" },
      ],
      total_bytes: 32_144_076_800,
      used_bytes: 14_905_135_104,
      available_bytes: 17_238_941_696,
      inodes_total: 15_728_064,
      inodes_free: 15_634_235,
      growth: { window_seconds: 3_600, used_delta_bytes: 52_428_800 },
    },
    {
      mount: "/tmp",
      fs_type: "tmpfs",
      paths: [{ use: "body_cache", path: "/tmp/clirelay-request-bodies" }],
      total_bytes: 2_055_684_096,
      used_bytes: 4_096,
      available_bytes: 2_055_680_000,
      inodes_total: 1_048_576,
      inodes_free: 1_048_570,
    },
  ],
  db: { rtt_ms: 8.2 },
  redis: { role: "cluster", rtt_ms: 7.9 },
  shared_redis: { configured: true, available: true },
  ...over,
});

// 生产库 2026-11-17 的样子（149 上 PostgreSQL 15.19，探针的几条查询只读跑出来的数）。
const database = {
  collected_at: iso(-12_000),
  engine: "postgres",
  version: "15.19",
  started_at: iso(-16 * 3_600_000),
  in_recovery: false,
  size_bytes: 561_995_111,
  xid_age: 89_696,
  connections: { max: 200, reserved: 3, client: 19, active: 0, idle: 18, idle_in_transaction: 0, wal_senders: 1 },
  activity: {
    longest_transaction_seconds: 0,
    long_transactions: 0,
    longest_idle_in_transaction_seconds: 0,
    lock_waits: 0,
    longest_lock_wait_seconds: 0,
  },
  wal: { bytes: 83_886_080, files: 5, max_wal_size_bytes: 1_073_741_824, max_slot_keep_bytes: 4_294_967_296 },
  slots: [
    {
      name: "clirelay_walarchive",
      type: "physical",
      active: true,
      wal_status: "reserved",
      retained_bytes: 834_064,
      safe_wal_size_bytes: 4_310_910_448,
    },
  ],
  replication: [
    {
      name: "pg_receivewal",
      state: "streaming",
      sync_state: "async",
      sent_lag_bytes: 0,
      flush_lag_bytes: 834_064,
      reply_age_seconds: 0.9,
    },
  ],
  window: { seconds: 300, commits: 3_600, rollbacks: 2, blocks_hit: 550_000, blocks_read: 1_100, deadlocks: 0, temp_bytes: 0 },
};

const databaseHost = {
  host_id: "db-149",
  role: "database",
  version: "dev-1234567",
  snapshot_at: iso(-6_000),
  age_seconds: 6,
  snapshot: snapshot({
    host: {
      cpus: 4,
      cpu: { window_seconds: 30, busy_cores: 0.62, steal_cores: 0.04, iowait_cores: 0.01, idle_cores: 3.33 },
      load: { load1: 0.8, load5: 0.7, load15: 0.6 },
      memory: { total_bytes: 8_322_871_296, available_bytes: 3_310_891_008 },
    },
    cgroup: undefined,
    egress: undefined,
    db: undefined,
    redis: undefined,
    shared_redis: undefined,
    disks: [
      {
        mount: "/",
        fs_type: "ext4",
        paths: [
          { use: "root", path: "/" },
          { use: "database", path: "/opt/clirelay-data/pg" },
        ],
        total_bytes: 41_429_692_416,
        used_bytes: 26_669_805_568,
        available_bytes: 14_743_109_632,
        inodes_total: 5_160_960,
        inodes_free: 4_821_091,
      },
    ],
  }),
};

const newBackendCluster = {
  enabled: true,
  node_id: "n155",
  is_leader: true,
  active_nodes: 2,
  nodes: [
    {
      node_id: "n149",
      version: "dev-1234567",
      advertise: "198.51.100.10",
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
      advertise: "198.51.100.20",
      started_at: iso(-3 * 3_600_000),
      last_seen: iso(-2_000),
      leader: true,
      active: true,
      self: true,
      snapshot: snapshot({ database }),
      snapshot_at: iso(-2_000),
    },
    {
      node_id: "n43",
      version: "dev-0000000",
      advertise: "198.51.100.30",
      started_at: iso(-86_400_000),
      last_seen: iso(-10 * 60_000),
      leader: false,
      active: false,
      self: false,
    },
  ],
  hosts: [databaseHost],
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

const CARDS = ["n149", "n155", "n43", "数据库"];

const sectionOf = (page: Page) =>
  page.getByRole("heading", { name: "服务器节点" }).locator("xpath=ancestor::section[1]");

test("每台节点一张紧凑卡片，数据库并排；要注意的情况写在卡片右上角", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDashboard(page, (route) => json(route, newBackendCluster));

  await expect(page.getByRole("heading", { name: "服务器节点" })).toBeVisible();
  await expect(page.getByText("2 / 3 在线")).toBeVisible();
  await expect(page.getByText("3 处告急")).toBeVisible();

  const self = page.getByRole("group", { name: "n155" });
  await expect(self.getByText("主节点")).toBeVisible();
  await expect(self.getByText("当前节点")).toBeVisible();
  await expect(self.getByTestId("health-pill").getByText("steal 78%")).toBeVisible();
  await expect(self.getByText("CPU · 8 核")).toBeVisible();
  await expect(self.getByRole("img", { name: "执行 0.76 核，steal 2.76 核，共 8 核" })).toBeVisible();
  await expect(self.getByText("磁盘 · /", { exact: true })).toBeVisible();
  await expect(self.getByText("Slot · 7.00 核")).toBeVisible();
  await expect(self.getByText("共享 Redis 7.9 ms")).toBeVisible();

  await expect(page.getByRole("group", { name: "n149" }).getByText("出口 熔断 1 个代理")).toBeVisible();
  const offline = page.getByRole("group", { name: "n43" });
  await expect(offline.getByTestId("health-pill").getByText("离线")).toBeVisible();
  await expect(offline.getByText(/还没有上报资源数据/)).toBeVisible();

  const database = page.getByRole("group", { name: "数据库" });
  await expect(database.getByText(/PostgreSQL 15\.19/)).toBeVisible();
  await expect(database.getByText("19 / 200")).toBeVisible();
  await expect(database.getByText("主机磁盘 · /")).toBeVisible();
  await expect(database.getByText("pg_receivewal · streaming")).toBeVisible();
  await expect(database.getByTestId("health-pill").getByText("正常")).toBeVisible();

  // 1280 宽下卡片分两行，但每张都完整落在分区里。
  const sectionBox = await sectionOf(page).boundingBox();
  for (const name of CARDS) {
    const box = await page.getByRole("group", { name }).boundingBox();
    expect(box && sectionBox).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1);
  }
});

/**
 * 同一行的卡片：等高；数字条、胶囊行、页脚各自在同一条水平线上（卡片的五行用 subgrid 共享父网格的
 * 行）。还没有快照的节点没有数字条和胶囊，只比它有的块。
 */
const expectRowsAligned = async (page: Page, width: number) => {
  const layout = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-testid="cluster-grid"] > [role="group"]')].map((card) => {
      const top = (selector: string) => card.querySelector<HTMLElement>(selector)?.getBoundingClientRect().top ?? null;
      const box = card.getBoundingClientRect();
      return {
        name: card.getAttribute("aria-label"),
        top: Math.round(box.top),
        height: Math.round(box.height),
        strip: top('[data-testid="stat-strip"]'),
        chips: top('[data-testid="chip-row"]'),
        footer: top('[data-testid="card-footer"]'),
      };
    }),
  );
  const bands = new Map<number, typeof layout>();
  for (const card of layout) bands.set(card.top, [...(bands.get(card.top) ?? []), card]);
  for (const band of bands.values()) {
    for (const card of band) {
      expect(Math.abs(card.height - band[0].height), `${card.name} height at ${width}px`).toBeLessThanOrEqual(1);
      for (const key of ["strip", "chips", "footer"] as const) {
        const other = band.find((candidate) => candidate[key] !== null);
        if (card[key] === null || !other) continue;
        expect(Math.abs(card[key]! - other[key]!), `${card.name} ${key} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  }
  // 返回相对卡片顶部的位置：页面滚动时绝对坐标会变，卡片自身的排布不该变。
  return layout.map((card) => ({
    name: card.name,
    height: card.height,
    strip: card.strip === null ? null : Math.round(card.strip - card.top),
    chips: card.chips === null ? null : Math.round(card.chips - card.top),
    footer: card.footer === null ? null : Math.round(card.footer - card.top),
  }));
};

test("宽屏一行放下三台节点和数据库，同一行卡片等高、各区块对齐，关键数值都不被截断", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openDashboard(page, (route) => json(route, newBackendCluster));
  await expect(page.getByRole("group", { name: "数据库" })).toBeVisible();

  const boxes = [];
  for (const name of CARDS) {
    const box = await page.getByRole("group", { name }).boundingBox();
    expect(box).toBeTruthy();
    boxes.push(box!);
  }
  for (const box of boxes) {
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThanOrEqual(1);
  }
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width);
  }

  // 1470 是三列最窄的时候（笔记本常见宽度），2026-11-17 回放线上响应时 WAL 格的槽名在这里被截断过；
  // 1280 两列，768 以下一列。
  for (const width of [1920, 1470, 1280, 700]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(100);
    await expectRowsAligned(page, width);
    const clipped = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid="cluster-grid"] [data-testid^="node-"] p, [data-testid="cluster-grid"] [data-testid^="node-"] span, [data-testid="cluster-grid"] [data-testid^="db-"] p, [data-testid="cluster-grid"] [data-testid^="db-"] span, [data-testid="stat-strip"] dd',
        ),
      ]
        .filter((el) => el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.textContent),
    );
    expect(clipped, `clipped at ${width}px`).toEqual([]);
  }
});

test("详情在右侧抽屉里看：卡片不变形，能在节点与数据库之间切换，Esc 关闭后焦点回到按钮", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openDashboard(page, (route) => json(route, newBackendCluster));
  const self = page.getByRole("group", { name: "n155" });
  await expect(self).toBeVisible();
  const before = await expectRowsAligned(page, 1920);

  const trigger = self.getByRole("button", { name: /详情/ });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "n155" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("tab", { name: "n155" })).toHaveAttribute("aria-selected", "true");
  await expect(drawer.getByRole("heading", { name: "需要注意" })).toBeVisible();
  await expect(drawer.getByText("clirelay2-8318.service")).toBeVisible();
  await expect(drawer.getByText("请求体缓存")).toBeVisible();
  // 卡片网格不因为看详情而变形。
  expect(await expectRowsAligned(page, 1920)).toEqual(before);

  await drawer.getByRole("tab", { name: "数据库" }).click();
  const database = page.getByRole("dialog", { name: "数据库" });
  await expect(database).toBeVisible();
  await expect(database.getByText("19 / 200（预留 3）")).toBeVisible();
  await expect(database.getByText("clirelay_walarchive")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
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
