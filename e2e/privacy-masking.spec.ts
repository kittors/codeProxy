import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 「隐私脱敏」页：头卡（处数、按天柱条、客户端 → CliRelay → 渠道的流向）、按请求 / 按值的列表、
 * 单条详情、设置页。接口全部 mock，不需要后端；PRIVACY_SHOTS 指定一个目录时顺便截图。
 *
 * 数据按真实用法编：Codex 每轮都把整段历史重发一遍，所以处数远多于不同的值。
 */

const NOW = new Date();
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const dayKey = (daysAgo: number) => {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 线上渠道名常是 OAuth 账号邮箱；短名的假数据看不出它压到流向图的线上、把客户端名挤成「C…」
const LONG_CHANNEL = "k3v9x2mq7z@privaterelay.appleid.com";

const SUMMARY = {
  days: [0, 1, 2, 3, 4, 5, 6].reverse().map((ago) => ({
    day: dayKey(ago),
    places: [0, 1840, 0, 6210, 9024, 3302, 40249][6 - ago],
    requests: [0, 61, 0, 205, 312, 118, 1204][6 - ago],
  })),
  places: 60625,
  distinct: 17,
  requests: 1900,
  blocked: 3,
  warned: 12,
  kinds: [
    { kind: "API_KEY", places: 41210, distinct: 4 },
    { kind: "PASSWORD", places: 12090, distinct: 5 },
    { kind: "PRIVATE_KEY", places: 3120, distinct: 1 },
    { kind: "TOKEN", places: 2870, distinct: 3 },
    { kind: "EMAIL", places: 1120, distinct: 2 },
    { kind: "TERM", places: 215, distinct: 2 },
  ],
  clients: [
    { name: "codex", places: 52480, requests: 1612 },
    { name: "claude-code", places: 7840, requests: 262 },
    { name: "gemini-cli", places: 305, requests: 26 },
  ],
  channels: [
    { name: "土豆 Codex 池", places: 51920, requests: 1590, vendor: "openai" },
    { name: "Claude 官方", places: 8100, requests: 271, vendor: "claude" },
    { name: LONG_CHANNEL, places: 605, requests: 39, vendor: "gemini" },
  ],
  values: [
    { id: "v1", kind: "API_KEY", by: "rule", head: "sk-", len: 52, places: 38440, requests: 1580, last_at: at(1) },
    { id: "v2", kind: "PASSWORD", by: "rule", head: "Q", len: 12, places: 9640, requests: 1210, last_at: at(2) },
    { id: "v3", kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, places: 3120, requests: 640, last_at: at(9) },
    { id: "v4", kind: "TOKEN", by: "rule", head: "eyJ", len: 164, places: 2210, requests: 402, last_at: at(30) },
    { id: "v5", kind: "PASSWORD", by: "known", head: "T", len: 10, places: 1950, requests: 380, last_at: at(4) },
    { id: "v6", kind: "EMAIL", by: "rule", head: "l", len: 21, places: 980, requests: 160, last_at: at(70) },
    { id: "v7", kind: "TERM", by: "word", head: "N", len: 8, places: 215, requests: 44, last_at: at(120) },
  ],
};

const RECORDS = [
  { key: "r1", at: at(1), client: "codex", channel: "土豆 Codex 池", provider: "openai", model: "gpt-5-codex", places: 32, distinct: 3, values: [
    { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 18 }, { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 12 }, { kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, n: 2 }] },
  { key: "r2", at: at(2), client: "codex", channel: "土豆 Codex 池", provider: "openai", model: "gpt-5-codex", places: 32, distinct: 3, values: [
    { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 18 }, { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 12 }, { kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, n: 2 }] },
  { key: "r3", at: at(4), client: "claude-code", channel: "Claude 官方", provider: "claude", model: "claude-sonnet-5", places: 9, distinct: 2, values: [
    { kind: "PASSWORD", by: "known", head: "T", len: 10, n: 6 }, { kind: "EMAIL", by: "rule", head: "l", len: 21, n: 3 }] },
  { key: "r4", at: at(6), client: "codex", channel: "", provider: "", model: "gpt-5-codex", places: 2, distinct: 1, blocked: true, values: [
    { kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, n: 2, action: "block" }] },
  { key: "r5", at: at(9), client: "codex", channel: "土豆 Codex 池", provider: "openai", model: "gpt-5-codex", places: 15, distinct: 2, values: [
    { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 9 }, { kind: "TOKEN", by: "rule", head: "eyJ", len: 164, n: 6 }] },
  { key: "r6", at: at(15), client: "gemini-cli", channel: LONG_CHANNEL, provider: "gemini", model: "gemini-3.1-pro", places: 4, distinct: 2, values: [
    { kind: "TERM", by: "word", head: "N", len: 8, n: 3 }, { kind: "EMAIL", by: "rule", head: "l", len: 21, n: 1 }] },
  { key: "r7", at: at(60 * 24 + 30), client: "codex", channel: "土豆 Codex 池", provider: "openai", model: "gpt-5-codex", places: 15, distinct: 2, values: [
    { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 9 }, { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 6 }] },
  { key: "r8", at: at(60 * 24 + 95), client: "claude-code", channel: "Claude 官方", provider: "claude", model: "claude-opus-5-5", places: 6, distinct: 1, values: [
    { kind: "TOKEN", by: "rule", head: "eyJ", len: 164, n: 6 }] },
];

const DETAIL = {
  ...RECORDS[0],
  took_us: 1240,
  restored: 3,
  values: [
    { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 18, restored: 2, field: "input[0].content[0].text", placeholder: "{{API_KEY_7moi35iu}}" },
    { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 12, restored: 1, field: "input[4].arguments", placeholder: "{{PASSWORD_n5t7zt53}}" },
    { kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, n: 2, field: "input[5].output", placeholder: "{{PRIVATE_KEY_cut2kavh}}" },
  ],
  snippets: [
    { field: "input[0].content[0].text", role: "user", text: "部署失败了，日志如下：\nOPENAI_API_KEY={{API_KEY_7moi35iu}}\n另外服务器密码：{{PASSWORD_n5t7zt53}}，帮我看看" },
    { field: "input[4].arguments", role: "function_call", text: "{\"cmd\":\"psql -h db.internal -U app -W {{PASSWORD_n5t7zt53}}\"}" },
    { field: "input[5].output", role: "function_call_output", text: "{{PRIVATE_KEY_cut2kavh}}" },
  ],
};

const SETTINGS = {
  policy: {
    secrets: true,
    personal: true,
    kinds: {},
    words: ["Nightjar", "db.acme-corp.cn"],
    words_any_case: true,
    words_whole: false,
    rules: [{ kind: "GATEWAY_KEY", prefix: "gw_live_" }],
    allow: ["ops@company.com"],
    actions: { PRIVATE_KEY: "block", EMAIL: "warn" },
  },
  enforced: ["secrets"],
  portal_default_allowed: true,
  persistent: true,
  key_protected: false,
  updated_at: "2026-11-05T08:00:00Z",
};

const MENUS = [
  { code: "dashboard", parent_code: "", type: "menu", path: "/dashboard", component: "dashboard", label_key: "shell.nav_dashboard", icon: "layout-dashboard", permission_code: "", sort_order: 10 },
  { code: "group.runtime", parent_code: "", type: "directory", path: "/runtime", component: "Layout", label_key: "shell.nav_group_runtime", icon: "activity", permission_code: "", sort_order: 20 },
  { code: "runtime.monitor", parent_code: "group.runtime", type: "menu", path: "/runtime/monitor", component: "monitor", label_key: "shell.nav_monitor", icon: "activity", permission_code: "", sort_order: 10 },
  { code: "runtime.request-logs", parent_code: "group.runtime", type: "menu", path: "/runtime/request-logs", component: "request-logs", label_key: "shell.nav_request_logs", icon: "scroll-text", permission_code: "", sort_order: 20 },
  { code: "runtime.privacy-masking", parent_code: "group.runtime", type: "menu", path: "/runtime/privacy-masking", component: "privacy-masking", label_key: "shell.nav_privacy_masking", icon: "shield-check", permission_code: "", sort_order: 25 },
  { code: "runtime.logs", parent_code: "group.runtime", type: "menu", path: "/runtime/logs", component: "logs", label_key: "shell.nav_logs", icon: "file-text", permission_code: "", sort_order: 30 },
].map((m) => ({ ...m, link_url: "", title: "", visible: true, enabled: true, badge_type: "", badge_content: "", hide_menu: false, system_protected: true, version: 1 }));

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function mock(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({ apiBase: "http://127.0.0.1:8317", managementKey: "cps_test", rememberPassword: false, expiresAt: Date.now() + 3_600_000 }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }));
  });
  const tenant = { id: "t-1", slug: "tudou", name: "土豆服务器", type: "standard", status: "active", effective_status: "active", expires_at: null, description: "", version: 1, created_at: "", updated_at: "" };
  await page.route("**/v0/auth/me", (route) =>
    json(route, {
      principal: {
        kind: "user_session",
        user: { id: "u-1", tenant_id: "t-1", username: "admin", display_name: "Super Administrator", status: "active", must_change_password: false, last_login_at: null, role_ids: [], role_codes: [], version: 1, created_at: "", updated_at: "" },
        home_tenant: tenant,
        effective_tenant: tenant,
        roles: [],
        permissions: ["content_moderation.read", "content_moderation.write", "content_moderation.test", "monitor.read", "request_logs.read"],
        platform_admin: false,
        menus: MENUS,
      },
    }),
  );
  await page.route("**/v0/management/**", (route) => json(route, { items: [], data: [], total: 0 }));
  await page.route("**/v0/management/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/v0\/management/, "");
    if (path === "/config") return json(route, { capabilities: { "privacy-masking": true } });
    if (path === "/update/check") return json(route, { has_update: false });
    if (path === "/privacy-masking/summary") return json(route, SUMMARY);
    if (path === "/privacy-masking/records") return json(route, { items: RECORDS, next: "r8" === url.searchParams.get("before") ? undefined : "r8" });
    if (path.startsWith("/privacy-masking/records/")) return json(route, DETAIL);
    if (path === "/privacy-masking/settings") return json(route, SETTINGS);
    if (path === "/privacy-masking/preview") {
      return json(route, {
        text: "用密钥 {{API_KEY_7moi35iu}} 部署，数据库密码：{{PASSWORD_n5t7zt53}}，发邮件给 ops@company.com",
        values: [{ kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 1 }, { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 1 }],
        blocked: false,
      });
    }
    return route.fallback();
  });
}

const shots = process.env.PRIVACY_SHOTS;
const shoot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

test.describe("privacy masking page", () => {
  test("overview, a request's detail and the settings", async ({ page }) => {
    // 走完整页：概览、说明、按值、详情、设置和试一试；冷启动的开发服务器上会超过默认 30 秒
    test.slow();
    await page.setViewportSize({ width: 1470, height: 900 });
    await mock(page);
    await page.goto("/#/runtime/privacy-masking");

    await expect(page.getByRole("heading", { name: "没让上游看到的" })).toBeVisible();
    await expect(page.getByText("60,625")).toBeVisible();
    await expect(page.getByRole("button", { name: /Codex/ }).first()).toBeVisible();
    await expect(page.getByText("今天").first()).toBeVisible();
    // 致谢 magpie：识别规则与还原做法移植自它
    await expect(page.getByRole("link", { name: "magpie" })).toHaveAttribute("href", "https://github.com/yetone/magpie");
    await page.waitForTimeout(2600); // 流向图的线画完
    const flow = page.locator("figure").filter({ hasText: "CliRelay 在服务器上把值换成占位符" });
    const lines = await flow.locator("svg").first().boundingBox();
    const node = await flow.getByRole("button").filter({ hasText: LONG_CHANNEL }).boundingBox();
    expect(node!.x).toBeGreaterThanOrEqual(lines!.x + lines!.width - 1);
    const row = page.locator("li button").filter({ hasText: LONG_CHANNEL }).first();
    expect(await row.getByText("Gemini CLI", { exact: true }).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await shoot(page, "1-overview");

    await page.getByRole("button", { name: "脱敏是怎么工作的" }).click();
    await shoot(page, "2-explainer");

    await page.getByRole("radio", { name: "按值" }).or(page.getByRole("button", { name: "按值" })).first().click();
    await expect(page.getByText("遮得最多的值")).toBeVisible();
    await shoot(page, "3-by-value");
    await page.getByRole("radio", { name: "按请求" }).or(page.getByRole("button", { name: "按请求" })).first().click();

    await page.locator("li button").filter({ hasText: "gpt-5-codex" }).first().click();
    await expect(page.getByText("这个请求经历了什么").or(page.getByText("请求内容")).first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: shots ? `${shots}/4-detail.png` : undefined });
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "设置" }).click();
    await expect(page.getByText("要遮什么")).toBeVisible();
    await page.getByRole("textbox", { name: "试一试" }).fill("用密钥 sk-proj-AbCd… 部署，数据库密码：Qx7mP2vL9kR4，发邮件给 ops@company.com");
    await expect(page.getByText("上游会收到", { exact: true })).toBeVisible();
    await shoot(page, "5-settings");
  });

  test("dark appearance", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1470, height: 900 });
    await mock(page);
    await page.goto("/#/runtime/privacy-masking");
    await expect(page.getByText("60,625")).toBeVisible();
    await page.waitForTimeout(2600);
    await shoot(page, "6-overview-dark");
  });

  test("an old backend gets a note and no requests", async ({ page }) => {
    await mock(page);
    await page.route("**/v0/management/config", (route) => json(route, { capabilities: {} }));
    let asked = false;
    page.on("request", (request) => {
      if (request.url().includes("/v0/management/privacy-masking")) asked = true;
    });
    await page.goto("/#/runtime/privacy-masking");
    await expect(page.getByText("当前后端还不支持隐私脱敏页")).toBeVisible();
    expect(asked).toBe(false);
  });
});
