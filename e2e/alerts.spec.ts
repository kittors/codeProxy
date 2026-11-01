import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 「告警」页和渠道分组页上的「池容量」卡：窗口宽度、密钥打码字段的呈现、保存只提交改过的部分、
 * 后端没声明能力时不发请求。接口全部 mock，不需要后端。
 */

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

const NOW = Date.now();
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const HOUR = 3_600_000;

const baseSettings = () => ({
  enabled: true,
  language: "zh-CN",
  cooldown_minutes: 360,
  channels: [
    {
      id: "ch-ops",
      kind: "webhook",
      name: "运维 Webhook",
      enabled: true,
      url: "https://hooks.example.com/****abcd",
      secret: "****",
    },
    {
      id: "ch-team",
      kind: "feishu",
      name: "团队群",
      enabled: true,
      url: "https://open.feishu.cn/****wxyz",
      secret: "",
    },
    {
      id: "ch-tg",
      kind: "telegram",
      name: "Telegram 值班",
      enabled: false,
      bot_token: "1234****abcd",
      chat_id: "-1001234567890",
    },
  ],
  rules: {
    quota_window: { enabled: true, threshold_percent: 90 },
    account_failure: { enabled: true, for_minutes: 10 },
    spending: { enabled: true, threshold_percent: 90 },
    use_it_or_lose_it: { enabled: false, min_remaining_percent: 40, hours_before_reset: 24 },
  },
  updated_at: "2026-11-01T08:00:00Z",
  persistent: true,
  limits: { max_channels: 8 },
});

const EVENTS = [
  {
    id: "ev-1",
    at: iso(-12 * 60_000),
    rule: "quota_window",
    severity: "warning",
    subject: {
      kind: "account",
      id: "codex-a.json",
      name: "a-very-long-mailbox-name-of-a-shared-account@example-enterprise.com",
    },
    title: "Codex 账号本周用量已达 92%",
    text: "账号 a-very-long-mailbox-name-of-a-shared-account@example-enterprise.com 的每周窗口已用 92%，约 2 天后重置。",
    deliveries: [
      {
        channel_id: "ch-ops",
        channel_name: "运维 Webhook",
        kind: "webhook",
        status: "sent",
        error: "",
      },
      {
        channel_id: "ch-team",
        channel_name: "团队群",
        kind: "feishu",
        status: "failed",
        error: "连接超时（5s）",
      },
    ],
  },
  {
    id: "ev-2",
    at: iso(-3 * HOUR),
    rule: "account_failure",
    severity: "critical",
    subject: { kind: "account", id: "claude-b.json", name: "claude-b@example.com" },
    title: "Claude 账号凭据已失效，需要重新授权",
    text: "上游返回 401，凭据被吊销。",
    deliveries: [
      {
        channel_id: "ch-ops",
        channel_name: "运维 Webhook",
        kind: "webhook",
        status: "sent",
        error: "",
      },
      {
        channel_id: "ch-tg",
        channel_name: "Telegram 值班",
        kind: "telegram",
        status: "failed",
        error: "the receiver answered HTTP 429",
      },
    ],
  },
  {
    id: "ev-3",
    at: iso(-26 * HOUR),
    rule: "spending",
    severity: "info",
    subject: { kind: "key", id: "key-1", name: "团队 Key" },
    title: "团队 Key 本月花费已用 90%",
    text: "限额 $200，已用 $180。",
    deliveries: [],
  },
  {
    id: "ev-4",
    at: iso(-30 * HOUR),
    rule: "test",
    severity: "info",
    subject: { kind: "channel", id: "ch-ops", name: "运维 Webhook" },
    title: "告警测试消息",
    text: "这是一条测试消息。",
    deliveries: [
      {
        channel_id: "ch-ops",
        channel_name: "运维 Webhook",
        kind: "webhook",
        status: "sent",
        error: "",
      },
    ],
  },
];

const POOLS = [
  {
    provider: "claude",
    window_key: "seven_day",
    window_label: "Weekly",
    window_seconds: 604800,
    accounts: 4,
    accounts_with_data: 4,
    remaining_percent: 12.4,
    earliest_reset_at: iso(3 * 24 * HOUR),
    burn_percent_per_hour: 1.8,
    projected_exhaustion_at: iso(6 * HOUR),
    observed_at: iso(-10 * 60_000),
  },
  {
    provider: "codex",
    window_key: "code_week",
    window_label: "Weekly",
    window_seconds: 604800,
    accounts: 5,
    accounts_with_data: 4,
    remaining_percent: 38.2,
    earliest_reset_at: iso(2 * 24 * HOUR),
    burn_percent_per_hour: 0.9,
    projected_exhaustion_at: iso(30 * HOUR),
    observed_at: iso(-20 * 60_000),
  },
  {
    provider: "codex",
    window_key: "code_5h",
    window_label: "5 Hour",
    window_seconds: 18000,
    accounts: 5,
    accounts_with_data: 5,
    remaining_percent: 71,
    earliest_reset_at: iso(3 * HOUR),
    burn_percent_per_hour: 4,
    observed_at: iso(-5 * 60_000),
  },
  {
    provider: "antigravity",
    window_key: "daily_image_quota",
    window_label: "Daily Image Quota",
    window_seconds: 86400,
    accounts: 3,
    accounts_with_data: 3,
    remaining_percent: 64,
    earliest_reset_at: iso(9 * HOUR),
    observed_at: iso(-8 * HOUR),
  },
  {
    provider: "kiro",
    window_key: "monthly_credits",
    window_label: "Monthly Credits",
    window_seconds: 2592000,
    accounts: 2,
    accounts_with_data: 0,
    remaining_percent: 0,
  },
];

const credentials = async (
  page: Page,
  options: { permissions: string[]; platformAdmin: boolean },
) => {
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
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
          permissions: options.permissions,
          platform_admin: options.platformAdmin,
        },
      }),
    }),
  );
};

interface MockOptions {
  capabilities?: Record<string, boolean>;
  permissions?: string[];
  platformAdmin?: boolean;
  /** 返回 400 的 PUT：用来看后端的 error.message 怎么显示。 */
  rejectPut?: { message: string; field: string };
}

const mockApis = async (page: Page, options: MockOptions = {}) => {
  const requests: RecordedRequest[] = [];
  let settings = baseSettings() as ReturnType<typeof baseSettings> & Record<string, unknown>;
  await credentials(page, {
    permissions: options.permissions ?? [
      "tenant_settings.read",
      "tenant_settings.write",
      "auth_files.read",
      "api_keys.read",
      "routing.read",
    ],
    platformAdmin: options.platformAdmin ?? false,
  });

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  // Playwright 先试最后注册的路由：兜底要最先注册，免得盖住具体的。
  await page.route("**/v0/management/**", (route) =>
    json(route, { items: [], files: [], data: [], total: 0 }),
  );
  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/v0\/management/, "");
    const method = request.method();
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = null;
    }
    if (path.startsWith("/alerts") || path === "/ai-accounts/pool-capacity") {
      requests.push({ method, path, body });
    }

    if (path === "/config") {
      return json(route, {
        capabilities: options.capabilities ?? { alerts: true, "pool-capacity": true },
      });
    }
    if (path === "/update/check") return json(route, { has_update: false });
    if (path === "/alerts/settings" && method === "GET") return json(route, settings);
    if (path === "/alerts/settings" && method === "PUT") {
      if (options.rejectPut) {
        return json(
          route,
          {
            error: {
              code: "invalid_alert_settings",
              message: options.rejectPut.message,
              details: { field: options.rejectPut.field },
            },
          },
          400,
        );
      }
      const patch = (body ?? {}) as Record<string, unknown>;
      settings = {
        ...settings,
        ...patch,
        rules: { ...settings.rules, ...(patch.rules as object | undefined) },
        updated_at: new Date().toISOString(),
      } as typeof settings;
      return json(route, settings);
    }
    if (path === "/alerts/test") {
      const channel = (body as { channel?: { id?: string; name?: string; kind?: string } } | null)
        ?.channel;
      return json(route, {
        results: [
          {
            channel_id: channel?.id ?? "draft",
            channel_name: channel?.name ?? "草稿",
            kind: channel?.kind ?? "webhook",
            ok: true,
            status: "sent",
            error: "",
            duration_ms: 123,
          },
        ],
      });
    }
    if (path === "/alerts/events") return json(route, { items: EVENTS, total: 12 });
    if (path === "/ai-accounts/pool-capacity") {
      return json(route, { generated_at: iso(0), pools: POOLS });
    }
    if (path === "/routing-config") {
      return json(route, {
        strategy: "round-robin",
        "include-default-group": true,
        "channel-groups": [{ name: "team", match: { channels: ["Team Codex"] } }],
        "path-routes": [{ path: "/team", group: "team" }],
        capabilities: { "routing-simulation": true },
      });
    }
    if (path === "/channel-groups") {
      return json(route, { items: [{ name: "team", channels: ["Team Codex"] }] });
    }
    if (path === "/api-key-entries") return json(route, { "api-key-entries": [] });
    return route.fallback();
  });

  return { requests, settings: () => settings };
};

/** 页面本身不许出现横向滚动：文档和外壳的滚动容器都不比视口宽。 */
const expectNoHorizontalOverflow = async (page: Page, width: number) => {
  const metrics = await page.evaluate(() => {
    const main = document.getElementById("main-content");
    return {
      doc: document.documentElement.scrollWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(metrics.doc).toBeLessThanOrEqual(width);
  expect(metrics.main).toBeLessThanOrEqual(0);
};

for (const width of [1280, 1470]) {
  test(`the alerts page fits a ${width}×720 window`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await mockApis(page);
    await page.goto("/#/system/alerts");

    await expect(page.getByRole("tab", { name: "通知" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "启用告警" })).toBeChecked();
    await expect(page.getByTestId("alert-channel-row")).toHaveCount(3);
    await page.screenshot({ path: testInfo.outputPath(`alerts-notify-${width}.png`) });
    await expectNoHorizontalOverflow(page, width);

    // 页面滚到底，钉在顶部的页签和保存区仍在视口里。
    await page.getByTestId("alert-channel-row").last().scrollIntoViewIfNeeded();
    await expect(page.getByRole("tab", { name: "规则" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`alerts-notify-scrolled-${width}.png`) });

    await page.getByRole("tab", { name: "规则" }).click();
    await expect(page.getByText("账号额度用量")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`alerts-rules-${width}.png`),
      fullPage: true,
    });
    await expectNoHorizontalOverflow(page, width);

    await page.getByRole("tab", { name: "最近记录" }).click();
    await expect(page.getByTestId("alert-event-row")).toHaveCount(EVENTS.length);
    await expect(page.getByText("连接超时（5s）")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`alerts-events-${width}.png`) });
    await expectNoHorizontalOverflow(page, width);
  });

  test(`the channel editor keeps stored secrets out of the inputs at ${width}×720`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await mockApis(page);
    await page.goto("/#/system/alerts");

    await page.getByRole("button", { name: "编辑 运维 Webhook" }).click();
    const dialog = page.getByRole("dialog", { name: "编辑通知通道" });
    await expect(dialog).toBeVisible();

    // 读回的打码串只作为说明显示，输入框是空的，占位符说明「已设置，留空保持不变」。
    const address = dialog.getByLabel("Webhook 地址");
    await expect(address).toHaveValue("");
    await expect(address).toHaveAttribute("placeholder", "已设置，留空保持不变");
    await expect(dialog.getByText("https://hooks.example.com/****abcd")).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    await page.screenshot({ path: testInfo.outputPath(`alerts-channel-modal-${width}.png`) });
  });

  test(`the pool capacity card fits the channel groups page at ${width}×720`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await mockApis(page);
    await page.goto("/#/models/channel-groups");

    const card = page.getByRole("region", { name: "池容量" });
    await expect(card).toBeVisible();
    // 最紧的池排最前，一句话说清剩多少、什么时候重置。
    await expect(card.getByText("Claude 池本周剩 12%，最早 3 天后重置")).toBeVisible();
    await expect(card.getByText("按近 6 小时的速度，", { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`pool-capacity-${width}.png`) });

    await card.getByRole("button", { name: /显示全部/ }).click();
    await expect(card.getByTestId("pool-capacity-row")).toHaveCount(POOLS.length);
    await expect(card.getByText("按近期速度，重置前不会用完").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`pool-capacity-all-${width}.png`) });
    await expectNoHorizontalOverflow(page, width);
  });
}

test("saving sends only what changed and shows the backend's message", async ({ page }) => {
  const mock = await mockApis(page);
  await page.goto("/#/system/alerts");

  const save = page.getByRole("button", { name: "保存", exact: true });
  await expect(save).toBeDisabled();

  await page.getByRole("switch", { name: "启用告警" }).click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("告警设置已保存")).toBeVisible();
  await expect(save).toBeDisabled();

  const put = mock.requests.filter((request) => request.method === "PUT");
  expect(put).toHaveLength(1);
  // 只改了总开关：别的字段（包括所有打码的密钥）一个都不在请求里。
  expect(put[0].body).toEqual({ enabled: false });
});

test("a rejected save shows the backend's message where it can be seen", async ({ page }) => {
  await mockApis(page, {
    rejectPut: { message: "channels[0].url must be an https URL", field: "channels[0].url" },
  });
  await page.goto("/#/system/alerts");

  await page.getByRole("switch", { name: "启用告警" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "channels[0].url must be an https URL" });
  await expect(alert.first()).toBeVisible();
  // 保存没成功：改动还在，保存按钮仍可点。
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeEnabled();
});

test("a test message is sent from the unsaved draft", async ({ page }) => {
  const mock = await mockApis(page);
  await page.goto("/#/system/alerts");

  await page.getByRole("button", { name: "编辑 运维 Webhook" }).click();
  const dialog = page.getByRole("dialog", { name: "编辑通知通道" });
  await dialog.getByLabel("Webhook 地址").fill("https://hooks.example.com/new-draft");
  await dialog.getByRole("button", { name: "发送测试消息" }).click();
  await expect(dialog.getByText("已发送（123 ms）")).toBeVisible();

  const test_ = mock.requests.find((request) => request.path === "/alerts/test");
  expect(test_?.body).toMatchObject({
    channel: { id: "ch-ops", kind: "webhook", url: "https://hooks.example.com/new-draft" },
  });
  // 没动的签名密钥原样回传打码串，后端按 id 解析成已存的值。
  expect(test_?.body).toMatchObject({ channel: { secret: "****" } });
});

test("a backend that does not declare alerts gets no alert requests", async ({ page }) => {
  const mock = await mockApis(page, { capabilities: {} });
  await page.goto("/#/system/alerts");

  await expect(page.getByText("当前后端不支持告警")).toBeVisible();
  expect(mock.requests.filter((request) => request.path.startsWith("/alerts"))).toEqual([]);
});

test("a read-only account can look but not change", async ({ page }) => {
  await mockApis(page, { permissions: ["tenant_settings.read"] });
  await page.goto("/#/system/alerts");

  await expect(page.getByText("你只有查看权限，不能修改告警设置")).toBeVisible();
  await expect(page.getByRole("switch", { name: "启用告警" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "添加通道" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
});

test("the pool capacity card stays away when the backend does not declare it", async ({ page }) => {
  const mock = await mockApis(page, { capabilities: { alerts: true } });
  await page.goto("/#/models/channel-groups");
  await expect(page.getByRole("heading", { name: "渠道分组管理" })).toBeVisible();
  await expect(page.getByRole("region", { name: "池容量" })).toHaveCount(0);
  expect(mock.requests.filter((request) => request.path === "/ai-accounts/pool-capacity")).toEqual(
    [],
  );
});

test("the pool capacity card stays away without auth_files.read", async ({ page }) => {
  const mock = await mockApis(page, { permissions: ["routing.read", "api_keys.read"] });
  await page.goto("/#/models/channel-groups");
  // 页面照常打开（路由权限是 routing.read），只是没有池容量卡，也没有去请求那个接口。
  await expect(page.getByRole("heading", { name: "渠道分组管理" })).toBeVisible();
  await expect(page.getByRole("region", { name: "池容量" })).toHaveCount(0);
  expect(mock.requests.filter((request) => request.path === "/ai-accounts/pool-capacity")).toEqual(
    [],
  );
});
