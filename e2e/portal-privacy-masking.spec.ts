import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 门户的「隐私脱敏」标签，只读：门户用户看自己请求的脱敏概览和记录、现在对自己生效的规则，用试一试
 * 看效果；要不要脱敏、遮什么由管理员决定，门户里没有任何设置入口，也不调任何写接口。
 *
 * 三种状态各跑浅色和深色：有记录；没有记录（租户没开脱敏）；旧后端（没有这个标签，也不发请求）。
 * 后端全部是内存里的假数据。PORTAL_PRIVACY_SHOTS 指定一个目录时顺便截图（本地看效果用，CI 不设）。
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

const EMPTY_SUMMARY = {
  days: [6, 5, 4, 3, 2, 1, 0].map((ago) => ({ day: dayKey(ago), places: 0, requests: 0 })),
  places: 0,
  distinct: 0,
  requests: 0,
  blocked: 0,
  warned: 0,
  kinds: [],
  clients: [],
  channels: [],
  values: [],
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

const policy = (patch: Record<string, unknown> = {}) => ({
  secrets: true,
  personal: false,
  kinds: {},
  // 门户用户没有自己的设置时，服务器给的是管理员的默认设置，脱敏词、规则和「从不脱敏」已清空
  words: [],
  words_any_case: false,
  words_whole: false,
  rules: [],
  allow: [],
  actions: {},
  ...patch,
});

/** 有记录：租户开了密钥和个人信息，私钥和邮箱另有处理方式，另有脱敏词（不显示内容）。 */
const MASKING_ON = {
  settings: {
    policy: policy({
      personal: true,
      actions: { PRIVATE_KEY: "block", EMAIL: "warn", TERM: "block" },
    }),
    updated_at: at(60 * 24),
  },
  summary: SUMMARY,
  records: RECORDS,
};

/** 没有记录：租户没开脱敏。 */
const MASKING_OFF = {
  settings: {
    policy: policy({ secrets: false }),
    updated_at: at(60 * 24),
  },
  summary: EMPTY_SUMMARY,
  records: [],
};

type Backend = typeof MASKING_ON | typeof MASKING_OFF | null;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/** backend 为 null：旧后端，/auth/me 的 capabilities 不声明 privacy-masking，也没有门户脱敏接口。 */
async function mockPortal(page: Page, backend: Backend) {
  const seen = { asked: 0, writes: [] as string[] };
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
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/v0/portal/auth/me") {
      return json(route, {
        user: {
          id: "u-alice",
          tenant_id: "t1",
          username: "alice",
          display_name: "Alice 工作室",
          status: "active",
        },
        capabilities: {
          "access-policy": true,
          ...(backend === null ? {} : { "privacy-masking": true }),
        },
        word_policy_allowed: false,
      });
    }
    if (path === "/v0/portal/api-keys") return json(route, { items: [], capabilities: {} });
    if (path.startsWith("/v0/portal/privacy-masking")) {
      seen.asked += 1;
      if (backend === null) return json(route, { error: "not found" }, 404);
      const sub = path.slice("/v0/portal/privacy-masking".length);
      if (method !== "GET" && sub !== "/preview") {
        seen.writes.push(`${method} ${path}`);
        return json(
          route,
          { error: { code: "unexpected", message: "the portal is read-only" } },
          405,
        );
      }
      if (sub === "/summary") return json(route, backend.summary);
      if (sub === "/records") return json(route, { items: backend.records });
      if (sub.startsWith("/records/")) return json(route, DETAIL);
      if (sub === "/settings") return json(route, backend.settings);
      if (sub === "/preview") {
        const body = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
        // 门户的试一试只发文字，由服务器按租户的设置处理
        if (Object.keys(body).join() !== "text")
          seen.writes.push(`preview with ${Object.keys(body).join()}`);
        return json(route, {
          text: "用密钥 {{API_KEY_7moi35iu}} 部署，数据库密码：{{PASSWORD_n5t7zt53}}，发邮件给 {{EMAIL_q2wn3k5d}}",
          values: [
            { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 1 },
            { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 1 },
            { kind: "EMAIL", by: "rule", head: "l", len: 21, n: 1, action: "warn" },
          ],
          blocked: false,
        });
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
  return seen;
}

const SHOTS = process.env.PORTAL_PRIVACY_SHOTS;
const shoot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(500); // 等切换、展开这类动画走完
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const openPrivacyTab = async (page: Page) => {
  await page.goto("/#/apikey-lookup");
  await page.getByRole("tab", { name: "隐私脱敏", exact: true }).click();
};

const expectNoChannelNames = async (page: Page) => {
  for (const name of CHANNELS) await expect(page.getByText(name)).toHaveCount(0);
};

/** 门户里没有任何设置入口。 */
const expectReadOnly = async (page: Page) => {
  await expect(page.getByRole("switch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "设置" })).toHaveCount(0);
  await expect(page.getByText("门户用户可以自己设置")).toHaveCount(0);
};

for (const scheme of ["light", "dark"] as const) {
  test.describe(`privacy masking in the portal (${scheme})`, () => {
    test.use({ colorScheme: scheme, viewport: { width: 1280, height: 720 } });

    test("an account with masked requests sees them, the rules in effect and a try-it", async ({
      page,
    }) => {
      test.slow(); // 概览、规则、试一试、详情一路走下来，冷启动的开发服务器上会超过 30 秒
      const seen = await mockPortal(page, MASKING_ON);
      await openPrivacyTab(page);

      await expect(page.getByRole("heading", { name: "没让上游看到的" })).toBeVisible();
      await expect(page.getByText("1,284")).toBeVisible();
      // 流向图右边是上游厂商：四个渠道合成 OpenAI、Claude 和「其他上游」，只显示、不能点
      const flow = page.locator("figure").filter({ hasText: "CliRelay 在服务器上把值换成占位符" });
      await expect(flow.getByRole("button", { name: /OpenAI/ })).toBeDisabled();
      await expect(flow.getByRole("button", { name: /^Claude(?! Code)/ })).toBeDisabled();
      await expect(flow.getByRole("button", { name: /其他上游/ })).toBeDisabled();
      await expect(flow.getByRole("button", { name: /^Claude Code/ })).toBeEnabled();
      await expectNoChannelNames(page);
      await expect(page.getByRole("button", { name: "脱敏是怎么工作的" })).toBeVisible();
      // 致谢 magpie：识别规则与还原做法移植自它
      await expect(page.getByRole("link", { name: "magpie" })).toHaveAttribute(
        "href",
        "https://github.com/yetone/magpie",
      );
      await expectReadOnly(page);
      // 标签自己的滚动区和控制台内容区一样不做橡皮筋回弹，吸顶的子标签栏不会被拉走
      expect(
        await page
          .locator("[data-scroll-fade-pin='top']")
          .first()
          .evaluate((el) => {
            let node = el.parentElement;
            while (node && getComputedStyle(node).overflowY !== "auto") node = node.parentElement;
            return node ? getComputedStyle(node).overscrollBehaviorY : "no scroller";
          }),
      ).toBe("none");
      await page.waitForTimeout(2600); // 流向图的线画完
      await shoot(page, `portal-1-overview-${scheme}`);

      await page.getByRole("tab", { name: "生效的规则" }).click();
      await expect(page.getByRole("heading", { name: "对你生效的脱敏规则" })).toBeVisible();
      // 没有「管理员强制」这回事：所有规则都由管理员定
      await expect(page.getByText("管理员已强制开启")).toHaveCount(0);
      await expect(
        page.getByText("管理员可能还配置了脱敏词和自定义规则，内容不对你显示。"),
      ).toBeVisible();
      const actions = page.getByRole("list", { name: "发现敏感值时" }).getByRole("listitem");
      await expect(actions.filter({ hasText: "私钥" })).toContainText("拦截");
      await expect(actions.filter({ hasText: "邮箱" })).toContainText("提醒");
      await expect(actions.filter({ hasText: "脱敏词" })).toContainText("拦截");
      await expectReadOnly(page);
      await page
        .getByRole("textbox", { name: "试一试" })
        .fill("用密钥 sk-proj-AbCd… 部署，数据库密码：Qx7mP2vL9kR4，发邮件给 lin@corp.example");
      await expect(page.getByText("上游会收到", { exact: true })).toBeVisible();
      await shoot(page, `portal-2-rules-${scheme}`);

      // 单条详情放最后：点列表里的一条会把标签的滚动区滚下去
      await page.getByRole("tab", { name: "概览" }).click();
      await page.locator("li button").filter({ hasText: "gpt-5-codex" }).first().click();
      const drawer = page.getByRole("dialog");
      await expect(drawer.getByRole("list", { name: "这个请求经历了什么" })).toBeVisible();
      // 「发给」那一步写的是上游厂商，不是渠道
      await expect(drawer.getByText("OpenAI").first()).toBeVisible();
      await expectNoChannelNames(page);
      await shoot(page, `portal-3-detail-${scheme}`);

      expect(seen.writes).toEqual([]);
    });

    test("an account whose tenant has not turned masking on is told so, with nothing to turn on", async ({
      page,
    }) => {
      const seen = await mockPortal(page, MASKING_OFF);
      await openPrivacyTab(page);

      await expect(page.getByText("你的请求还没有开启脱敏")).toBeVisible();
      await expect(page.getByText(/要不要开启由管理员决定/)).toBeVisible();
      await expect(page.getByRole("button", { name: "去开启脱敏" })).toHaveCount(0);
      await expect(page.getByText("还没有脱敏过任何内容")).toBeVisible();
      await expectReadOnly(page);
      await shoot(page, `portal-4-off-${scheme}`);

      await page.getByRole("tab", { name: "生效的规则" }).click();
      await expect(page.getByText("未开启").first()).toBeVisible();
      await shoot(page, `portal-5-off-rules-${scheme}`);
      expect(seen.writes).toEqual([]);
    });

    test("an older backend gets no privacy masking tab and no requests for it", async ({
      page,
    }) => {
      const seen = await mockPortal(page, null);
      await page.goto("/#/apikey-lookup");
      await expect(page.getByRole("tab", { name: "管理 API Key" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "隐私脱敏", exact: true })).toHaveCount(0);
      await page.waitForTimeout(500);
      expect(seen.asked).toBe(0);
      await shoot(page, `portal-6-old-backend-${scheme}`);
    });
  });
}

test("a phone-sized window has no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPortal(page, MASKING_ON);
  await openPrivacyTab(page);
  await expect(page.getByText("1,284")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("tab", { name: "生效的规则" }).click();
  await expect(page.getByRole("heading", { name: "对你生效的脱敏规则" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/portal-7-phone-rules.png`, fullPage: true });
});
