import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 门户的「隐私脱敏」标签：门户用户看自己请求的脱敏记录、改自己的设置。三种账号：能自己设置的、
 * 管理员没开放的（只读）、旧后端（没有这个标签，也不发请求）。后端全部是内存里的假数据，保存会真的
 * 改动它，下一次读取能读到。PORTAL_PRIVACY_SHOTS 指定一个目录时顺便截图（本地看效果用，CI 不设）。
 */

const NOW = new Date();
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
const dayKey = (daysAgo: number) => {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// 线上渠道名常是 OAuth 账号邮箱、内部号池名：门户里一个都不能出现，只显示上游厂商
const CHANNELS = [
  "k3v9x2mq7z@privaterelay.appleid.com",
  "土豆 Codex 池",
  "Claude 官方",
  "tudou-relay",
];

const SUMMARY = {
  days: [6, 5, 4, 3, 2, 1, 0].map((ago, i) => ({
    day: dayKey(ago),
    places: [0, 84, 0, 212, 306, 118, 564][i],
    requests: [0, 9, 0, 22, 31, 12, 58][i],
  })),
  places: 1284,
  distinct: 6,
  requests: 132,
  blocked: 1,
  warned: 2,
  kinds: [
    { kind: "API_KEY", places: 902, distinct: 2 },
    { kind: "PASSWORD", places: 288, distinct: 2 },
    { kind: "EMAIL", places: 94, distinct: 2 },
  ],
  clients: [
    { name: "codex", places: 1102, requests: 108 },
    { name: "claude-code", places: 182, requests: 24 },
  ],
  channels: [
    { name: CHANNELS[0], places: 760, requests: 70, vendor: "codex" },
    { name: CHANNELS[1], places: 342, requests: 38, vendor: "codex" },
    { name: CHANNELS[2], places: 170, requests: 22, vendor: "claude" },
    { name: CHANNELS[3], places: 12, requests: 2, vendor: "tudou-relay" },
  ],
  values: [
    {
      id: "v1",
      kind: "API_KEY",
      by: "rule",
      head: "sk-",
      len: 52,
      places: 820,
      requests: 96,
      last_at: at(1),
    },
    {
      id: "v2",
      kind: "PASSWORD",
      by: "rule",
      head: "Q",
      len: 12,
      places: 260,
      requests: 70,
      last_at: at(3),
    },
    {
      id: "v3",
      kind: "EMAIL",
      by: "rule",
      head: "l",
      len: 21,
      places: 94,
      requests: 18,
      last_at: at(40),
    },
  ],
};

const RECORDS = [
  {
    key: "a00000000000000000000001",
    at: at(1),
    client: "codex",
    channel: CHANNELS[0],
    provider: "codex",
    model: "gpt-5-codex",
    api_key_name: "工作电脑",
    places: 24,
    distinct: 2,
    values: [
      { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 16 },
      { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 8 },
    ],
  },
  {
    key: "a00000000000000000000002",
    at: at(3),
    client: "claude-code",
    channel: CHANNELS[2],
    provider: "claude",
    model: "claude-sonnet-5",
    api_key_name: "工作电脑",
    places: 6,
    distinct: 1,
    values: [{ kind: "EMAIL", by: "rule", head: "l", len: 21, n: 6, action: "warn" }],
  },
  {
    key: "a00000000000000000000003",
    at: at(9),
    client: "codex",
    channel: "",
    provider: "",
    model: "gpt-5-codex",
    api_key_name: "CI",
    places: 1,
    distinct: 1,
    blocked: true,
    values: [{ kind: "PRIVATE_KEY", by: "rule", head: "-", len: 411, n: 1, action: "block" }],
  },
  {
    key: "a00000000000000000000004",
    at: at(60 * 24 + 20),
    client: "codex",
    channel: CHANNELS[1],
    provider: "codex",
    model: "gpt-5-codex",
    api_key_name: "CI",
    places: 12,
    distinct: 1,
    values: [{ kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 12 }],
  },
];

const DETAIL = {
  ...RECORDS[0],
  took_us: 980,
  restored: 2,
  values: [
    {
      kind: "API_KEY",
      by: "rule",
      head: "sk-",
      len: 52,
      n: 16,
      restored: 2,
      field: "input[0].content[0].text",
      placeholder: "{{API_KEY_7moi35iu}}",
    },
    {
      kind: "PASSWORD",
      by: "rule",
      head: "Q",
      len: 12,
      n: 8,
      field: "input[3].arguments",
      placeholder: "{{PASSWORD_n5t7zt53}}",
    },
  ],
  snippets: [
    {
      field: "input[0].content[0].text",
      role: "user",
      text: "部署脚本报错：\nOPENAI_API_KEY={{API_KEY_7moi35iu}}\n数据库密码：{{PASSWORD_n5t7zt53}}",
    },
  ],
};

type Policy = Record<string, unknown> & { personal?: boolean };

/** 管理员的默认设置：门户视图里去掉了管理员的脱敏词、规则和「从不脱敏」。 */
const TENANT_DEFAULT: Policy = {
  secrets: true,
  personal: false,
  kinds: {},
  words: [],
  words_any_case: false,
  words_whole: false,
  rules: [],
  allow: [],
  actions: {},
};

class FakePortalMasking {
  own: Policy | null = null;
  updatedAt = "";
  writes: Array<{ method: string; path: string; body: unknown }> = [];
  asked = 0;
  constructor(
    public allowed: boolean,
    public enforced: string[] = ["secrets"],
  ) {}
  view() {
    const own = this.allowed && this.own !== null;
    return {
      policy: own ? this.own : TENANT_DEFAULT,
      own,
      allowed: this.allowed,
      enforced: this.enforced,
      portal_default_allowed: this.allowed,
      persistent: true,
      updated_at: this.updatedAt,
    };
  }
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** allowed 为 null：旧后端，/auth/me 不带 privacy_masking_allowed，也没有门户脱敏接口。 */
async function mockPortal(page: Page, backend: FakePortalMasking, allowed: boolean | null) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-portal-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        accessToken: "portal-access-token",
        refreshToken: "portal-refresh-token",
        remember: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        user: { id: "u-alice", username: "alice", display_name: "Alice 工作室" },
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData()
      ? (JSON.parse(request.postData() ?? "{}") as Record<string, unknown>)
      : {};
    if (path === "/v0/portal/auth/me") {
      return json(route, {
        user: {
          id: "u-alice",
          tenant_id: "t1",
          username: "alice",
          display_name: "Alice 工作室",
          status: "active",
        },
        capabilities: { "access-policy": true },
        word_policy_allowed: false,
        ...(allowed === null ? {} : { privacy_masking_allowed: allowed }),
      });
    }
    if (path === "/v0/portal/api-keys") return json(route, { items: [], capabilities: {} });
    if (path.startsWith("/v0/portal/privacy-masking")) {
      backend.asked += 1;
      if (allowed === null) return json(route, { error: "not found" }, 404);
      if (method !== "GET") backend.writes.push({ method, path, body });
      const sub = path.slice("/v0/portal/privacy-masking".length);
      if (sub === "/summary") return json(route, SUMMARY);
      if (sub === "/records") return json(route, { items: RECORDS });
      if (sub.startsWith("/records/")) return json(route, DETAIL);
      if (sub === "/preview") {
        return json(route, {
          text: "用密钥 {{API_KEY_7moi35iu}} 部署，数据库密码：{{PASSWORD_n5t7zt53}}，发邮件给 lin@corp.example",
          values: [
            { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 1 },
            { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 1 },
          ],
          blocked: false,
        });
      }
      if (sub === "/settings") {
        if (method !== "GET" && !backend.allowed) {
          return json(
            route,
            { error: { code: "privacy_masking_portal_forbidden", message: "no" } },
            403,
          );
        }
        if (method === "PUT") {
          backend.own = body.policy as Policy;
          backend.updatedAt = new Date().toISOString();
        }
        if (method === "DELETE") backend.own = null;
        return json(route, backend.view());
      }
    }
    if (path.endsWith("/usage/chart-data")) {
      return json(route, {
        daily_series: [],
        heatmap_series: [],
        model_distribution: [],
        stats: { total: 0, success_rate: 0, total_tokens: 0, total_sessions: 0, total_cost: 0 },
      });
    }
    return json(route, { items: [], total: 0, data: [] });
  });
}

const SHOTS = process.env.PORTAL_PRIVACY_SHOTS;
const shoot = async (page: Page, name: string, fullPage = true) => {
  if (!SHOTS) return;
  await page.waitForTimeout(500); // 等切换、展开这类动画走完
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });
};

const openPrivacyTab = async (page: Page) => {
  await page.goto("/#/apikey-lookup");
  await page.getByRole("tab", { name: "隐私脱敏", exact: true }).click();
  await expect(page.getByRole("heading", { name: "没让上游看到的" })).toBeVisible();
};

const expectNoChannelNames = async (page: Page) => {
  for (const name of CHANNELS) await expect(page.getByText(name)).toHaveCount(0);
};

test.describe("privacy masking in the portal", () => {
  test("an account that may set its own sees its records and keeps its own settings", async ({
    page,
  }) => {
    test.slow(); // 概览、详情、设置、保存、恢复默认一路走下来，冷启动的开发服务器上会超过 30 秒
    const backend = new FakePortalMasking(true);
    await page.setViewportSize({ width: 1280, height: 720 });
    await mockPortal(page, backend, true);
    await openPrivacyTab(page);

    await expect(page.getByText("1,284")).toBeVisible();
    // 流向图右边是上游厂商：四个渠道合成 OpenAI、Claude 和「其他上游」，只显示、不能点
    const flow = page.locator("figure").filter({ hasText: "CliRelay 在服务器上把值换成占位符" });
    await expect(flow.getByRole("button", { name: /OpenAI/ })).toBeDisabled();
    await expect(flow.getByRole("button", { name: /^Claude(?! Code)/ })).toBeDisabled();
    await expect(flow.getByRole("button", { name: /^Claude Code/ })).toBeEnabled();
    await expect(flow.getByRole("button", { name: /其他上游/ })).toBeDisabled();
    await expectNoChannelNames(page);
    // 致谢 magpie：识别规则与还原做法移植自它
    await expect(page.getByRole("link", { name: "magpie" })).toHaveAttribute(
      "href",
      "https://github.com/yetone/magpie",
    );
    await page.waitForTimeout(2600); // 流向图的线画完
    await shoot(page, "portal-1-overview");

    await page.getByRole("tab", { name: "我的设置" }).click();
    await expect(page.getByText("现在用的是管理员的默认设置")).toBeVisible();
    await expect(
      page.getByText("管理员设置的脱敏词、自定义规则和「从不脱敏」始终生效，这里不显示。"),
    ).toBeVisible();
    // 管理员强制了「脱敏密钥」：锁着，提醒选不了
    const secrets = page.getByRole("switch", { name: "脱敏密钥" });
    await expect(secrets).toBeChecked();
    await expect(secrets).toBeDisabled();
    await expect(
      page.getByRole("radiogroup", { name: "API 密钥" }).getByRole("radio", { name: "提醒" }),
    ).toBeDisabled();
    // 控制台才有的「管理」一组不出现
    await expect(page.getByText("门户用户可以自己设置")).toHaveCount(0);
    await shoot(page, "portal-3-settings-default");

    await page.getByRole("switch", { name: "脱敏个人信息" }).click();
    const bar = page.getByRole("region", { name: "有未保存的修改" });
    await expect(bar).toBeVisible();
    // 保存栏钉在标签滚动区的底部（门户的敏感词也是这样）
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    expect(box!.y + box!.height).toBeGreaterThan(720 - 80);
    await shoot(page, "portal-4-unsaved", false);
    await bar.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("你在用自己的设置")).toBeVisible();
    const put = backend.writes.find((w) => w.method === "PUT");
    // 强制的类目、门户用户能否自设都是管理员的，门户只发自己的设置
    expect(Object.keys(put!.body as object)).toEqual(["policy"]);
    expect((put!.body as { policy: Policy }).policy.personal).toBe(true);

    await page
      .getByRole("textbox", { name: "试一试" })
      .fill("用密钥 sk-proj-AbCd… 部署，数据库密码：Qx7mP2vL9kR4，发邮件给 lin@corp.example");
    await expect(page.getByText("上游会收到", { exact: true })).toBeVisible();
    await shoot(page, "portal-5-own");

    await page.getByRole("button", { name: "恢复默认设置" }).click();
    const dialog = page.getByRole("dialog", { name: "恢复为管理员的默认设置？" });
    await dialog.getByRole("button", { name: "恢复默认" }).click();
    await expect(page.getByText("现在用的是管理员的默认设置")).toBeVisible();
    expect(
      backend.writes.some(
        (w) => w.method === "DELETE" && w.path === "/v0/portal/privacy-masking/settings",
      ),
    ).toBe(true);
    await expect(page.getByRole("switch", { name: "脱敏个人信息" })).not.toBeChecked();

    // 单条详情放在最后：点列表里的一条会把标签的滚动区滚下去，切到「我的设置」时还停在那里
    await expect(page.getByText("已恢复为管理员的默认设置")).toBeHidden({ timeout: 10_000 });
    await page.getByRole("tab", { name: "概览" }).click();
    await page.locator("li button").filter({ hasText: "gpt-5-codex" }).first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("list", { name: "这个请求经历了什么" })).toBeVisible();
    // 「发给」那一步写的是上游厂商，不是渠道
    await expect(drawer.getByText("OpenAI").first()).toBeVisible();
    await expectNoChannelNames(page);
    await shoot(page, "portal-2-detail", false);
    await page.keyboard.press("Escape");
  });

  test("an account the administrator has not allowed sees its records and read-only settings", async ({
    page,
  }) => {
    const backend = new FakePortalMasking(false);
    await page.setViewportSize({ width: 1280, height: 720 });
    await mockPortal(page, backend, false);
    await openPrivacyTab(page);
    await expectNoChannelNames(page);

    await page.getByRole("tab", { name: "我的设置" }).click();
    await expect(page.getByText("管理员没有开放自定义脱敏")).toBeVisible();
    await expect(page.getByRole("switch", { name: "脱敏密钥" })).toBeDisabled();
    await expect(page.getByRole("switch", { name: "脱敏个人信息" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "恢复默认设置" })).toHaveCount(0);
    await shoot(page, "portal-6-readonly");
    expect(backend.writes).toEqual([]);
  });

  test("an older backend gets no privacy masking tab and no requests for it", async ({ page }) => {
    const backend = new FakePortalMasking(true);
    await mockPortal(page, backend, null);
    await page.goto("/#/apikey-lookup");
    await expect(page.getByRole("tab", { name: "管理 API Key" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "隐私脱敏", exact: true })).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(backend.asked).toBe(0);
  });

  test("dark appearance", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1470, height: 800 });
    const backend = new FakePortalMasking(true);
    backend.own = {
      ...TENANT_DEFAULT,
      personal: true,
      words: ["Nightjar"],
      allow: ["ops@company.com"],
    };
    backend.updatedAt = at(60);
    await mockPortal(page, backend, true);
    await openPrivacyTab(page);
    await page.waitForTimeout(2600);
    await shoot(page, "portal-7-overview-dark");
    await page.getByRole("tab", { name: "我的设置" }).click();
    await expect(page.getByText("你在用自己的设置")).toBeVisible();
    await shoot(page, "portal-8-settings-dark");
  });

  test("a phone-sized window", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const backend = new FakePortalMasking(true);
    await mockPortal(page, backend, true);
    await openPrivacyTab(page);
    // 窄屏不出现横向滚动
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await shoot(page, "portal-9-phone");
  });
});
