import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

/**
 * 内部滚动区的上下渐隐（useScrollFade）。量 DOM 上的标记和变量，不靠截图比对：
 *
 * - 主内容区：滚到中间同时带「上面还有」「下面还有」两个标记；到顶只剩下面，到底只剩上面。
 * - sticky 页签栏是钉住区：顶部渐隐从栏的下沿开始，栏本身不淡。
 * - 表格：遮罩挂在内容层上，表头是钉住区；自绘滚动条在遮罩外面，不被淡掉。
 * - 整页表格钉满一屏、外壳滚不动时，主内容区完全不淡。
 * - 下拉面板走 portal，不在任何遮罩里（mask 会把子孙里的 fixed 浮层一起裁掉）。
 *
 * SCROLL_FADE_SHOTS 指定一个目录时，按 1280×720 / 1470×900、浅色 / 深色截图走查。
 */

const NOW = Date.now();
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const dayKey = (daysAgo: number) => {
  const d = new Date(NOW - daysAgo * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const SUMMARY = {
  days: [6, 5, 4, 3, 2, 1, 0].map((ago, i) => ({
    day: dayKey(ago),
    places: [0, 1840, 0, 6210, 9024, 3302, 40249][i],
    requests: [0, 61, 0, 205, 312, 118, 1204][i],
  })),
  places: 60625,
  distinct: 17,
  requests: 1900,
  blocked: 3,
  warned: 12,
  kinds: [
    { kind: "API_KEY", places: 41210, distinct: 4 },
    { kind: "PASSWORD", places: 12090, distinct: 5 },
    { kind: "EMAIL", places: 1120, distinct: 2 },
  ],
  clients: [
    { name: "codex", places: 52480, requests: 1612 },
    { name: "claude-code", places: 7840, requests: 262 },
  ],
  channels: [
    { name: "土豆 Codex 池", places: 51920, requests: 1590, vendor: "openai" },
    { name: "Claude 官方", places: 8100, requests: 271, vendor: "claude" },
  ],
  values: [
    {
      id: "v1",
      kind: "API_KEY",
      by: "rule",
      head: "sk-",
      len: 52,
      places: 38440,
      requests: 1580,
      last_at: at(1),
    },
    {
      id: "v2",
      kind: "PASSWORD",
      by: "rule",
      head: "Q",
      len: 12,
      places: 9640,
      requests: 1210,
      last_at: at(2),
    },
    {
      id: "v3",
      kind: "EMAIL",
      by: "rule",
      head: "l",
      len: 21,
      places: 980,
      requests: 160,
      last_at: at(70),
    },
  ],
};

const RECORDS = Array.from({ length: 14 }, (_, i) => {
  const codex = i % 3 !== 0;
  return {
    key: `r${i}`,
    at: at(i * 9 + 1),
    client: codex ? "codex" : "claude-code",
    channel: codex ? "土豆 Codex 池" : "Claude 官方",
    provider: codex ? "openai" : "claude",
    model: codex ? "gpt-5-codex" : "claude-sonnet-5",
    places: 6 + i,
    distinct: 2,
    values: [
      { kind: "API_KEY", by: "rule", head: "sk-", len: 52, n: 4 + i },
      { kind: "PASSWORD", by: "rule", head: "Q", len: 12, n: 2 },
    ],
  };
});

const DETAIL = {
  ...RECORDS[1],
  took_us: 1240,
  restored: 1,
  values: [
    {
      kind: "API_KEY",
      by: "rule",
      head: "sk-",
      len: 52,
      n: 5,
      restored: 1,
      field: "input[0].content[0].text",
      placeholder: "{{API_KEY_7moi35iu}}",
    },
    {
      kind: "PASSWORD",
      by: "rule",
      head: "Q",
      len: 12,
      n: 2,
      field: "input[4].arguments",
      placeholder: "{{PASSWORD_n5t7zt53}}",
    },
  ],
  snippets: [
    {
      field: "input[0].content[0].text",
      role: "user",
      text: "部署失败了，日志如下：\nOPENAI_API_KEY={{API_KEY_7moi35iu}}\n服务器密码：{{PASSWORD_n5t7zt53}}",
    },
    {
      field: "input[4].arguments",
      role: "function_call",
      text: '{"cmd":"psql -U app -W {{PASSWORD_n5t7zt53}}"}',
    },
  ],
};

const SETTINGS = {
  policy: {
    secrets: true,
    personal: true,
    kinds: {},
    words: [],
    words_any_case: true,
    words_whole: false,
    rules: [],
    allow: [],
    actions: {},
  },
  enforced: [],
  portal_default_allowed: true,
  persistent: true,
  key_protected: true,
  updated_at: "2026-11-05T08:00:00Z",
};

const REQUEST_LOGS = Array.from({ length: 40 }, (_, i) => ({
  id: 3000 + i,
  timestamp: at(i * 3),
  api_key: "sk-tes***l-qa",
  api_key_id: `qa-key-${String(i % 6).padStart(4, "0")}`,
  api_key_name: `QA Key ${(i % 6) + 1}`,
  model: i % 2 ? "claude-sonnet-5" : "gpt-5-codex",
  source: "openai",
  channel_name: i % 2 ? "Claude 官方" : "土豆 Codex 池",
  auth_index: `auth-${i % 4}`,
  failed: i % 9 === 4,
  streaming: true,
  latency_ms: 850 + i * 37,
  first_token_ms: 90 + i * 4,
  input_tokens: 1200 + i * 13,
  output_tokens: 240 + i * 3,
  reasoning_tokens: 0,
  cached_tokens: i % 3 ? 0 : 400,
  total_tokens: 1440 + i * 16,
  cost: 0.0123 + i * 0.001,
  has_content: true,
}));

const AUTH_FILES = Array.from({ length: 24 }, (_, i) => ({
  id: `auth-${i}`,
  name: `account-${i}@example.com.json`,
  label: `account-${i}@example.com`,
  type: i % 2 ? "claude" : "codex",
  provider: i % 2 ? "claude" : "codex",
  account_type: "oauth",
  auth_index: `idx-${i}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + i,
}));

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

async function mock(page: Page) {
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
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.removeItem("codeProxy.dataTable.columnWidths.v3.request-logs");
    localStorage.removeItem("codeProxy.dataTable.columnOrder.v1.request-logs");
  });
  await page.route("**/v0/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/v0\/management/, "");
    if (path === "/config") return json(route, { capabilities: { "privacy-masking": true } });
    if (path === "/update/check") return json(route, { has_update: false });
    if (path === "/privacy-masking/summary") return json(route, SUMMARY);
    if (path === "/privacy-masking/records") return json(route, { items: RECORDS });
    if (path.startsWith("/privacy-masking/records/")) return json(route, DETAIL);
    if (path === "/privacy-masking/settings") return json(route, SETTINGS);
    if (path === "/usage/logs") {
      return json(route, {
        items: REQUEST_LOGS,
        total: REQUEST_LOGS.length,
        page: 1,
        size: 50,
        filters: {
          api_key_ids: [],
          models: ["gpt-5-codex", "claude-sonnet-5"],
          channels: ["土豆 Codex 池", "Claude 官方"],
        },
        stats: {
          total: REQUEST_LOGS.length,
          success_rate: 90,
          total_tokens: 64000,
          total_cost: 1.2,
          cache_rate: 12,
        },
      });
    }
    if (path === "/auth-files") return json(route, { files: AUTH_FILES });
    if (path === "/usage/entity-stats") return json(route, { source: [], auth_index: [] });
    if (path.includes("/ai-accounts/status-refresh")) {
      return json(route, {
        job_id: "j",
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      });
    }
    return json(route, { items: [], files: [], data: [], total: 0 });
  });
}

/** 外壳的滚动容器：<main> 的父级。 */
const mainScroller = (page: Page) => page.locator("#main-content").locator("xpath=..");
/** AI 账号卡片视图的滚动区（ScrollArea 的视口）。 */
const cardViewport = (page: Page) =>
  page.locator("[data-testid='auth-files-cards'] [data-scroll-area-viewport]");

const fadeState = (target: Locator) =>
  target.evaluate((el) => ({
    fade: el.getAttribute("data-scroll-fade"),
    top: el.hasAttribute("data-scroll-more-top"),
    bottom: el.hasAttribute("data-scroll-more-bottom"),
    topInset:
      parseFloat((el as HTMLElement).style.getPropertyValue("--scroll-fade-top-inset")) || 0,
  }));

const scrollTo = (target: Locator, top: number) =>
  target.evaluate((el, value) => {
    el.scrollTop = value;
  }, top);

test.describe("内部滚动区的上下渐隐", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("主内容区滚到中间上下都淡、到头那一侧不淡，顶部渐隐从 sticky 页签栏下沿开始", async ({
    page,
  }) => {
    await mock(page);
    await page.goto("/#/runtime/privacy-masking");
    await expect(page.getByRole("heading", { name: "没让上游看到的" })).toBeVisible();
    const shell = mainScroller(page);
    await expect
      .poll(() => fadeState(shell))
      .toMatchObject({ fade: "y", top: false, bottom: true });

    await scrollTo(shell, 240);
    await expect.poll(() => fadeState(shell)).toMatchObject({ top: true, bottom: true });
    // 页签栏贴在顶上：钉住区正好到它的下沿，栏本身不在渐隐带里。
    const barBottom = await page
      .locator("[data-scroll-fade-pin='top']")
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom);
    const shellTop = await shell.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      Math.abs((await fadeState(shell)).topInset - (barBottom - shellTop)),
    ).toBeLessThanOrEqual(1);

    await scrollTo(shell, 100_000);
    await expect.poll(() => fadeState(shell)).toMatchObject({ top: true, bottom: false });
  });

  test("表格的遮罩挂在内容层上：渐隐从表头下沿开始，滚动条和钉满一屏的外壳都不淡", async ({
    page,
  }) => {
    await mock(page);
    await page.goto("/#/runtime/request-logs");
    await expect(page.locator("tr[data-vt-row-index]").first()).toBeVisible();
    const frame = page.locator("[data-vt-content-frame]").first();
    const scroller = page.locator("[data-scrollbar-visibility='hover']").first();
    await expect
      .poll(() => fadeState(frame))
      .toMatchObject({ fade: "y", top: false, bottom: true });
    // 整页表格钉满一屏，外壳滚不动：主内容区完全不淡。
    expect(await fadeState(mainScroller(page))).toMatchObject({
      fade: null,
      top: false,
      bottom: false,
    });

    await scrollTo(scroller, 200);
    await expect.poll(() => fadeState(frame)).toMatchObject({ top: true, bottom: true });
    const headerHeight = await page
      .locator("[data-vt-header-chrome]")
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs((await fadeState(frame)).topInset - headerHeight)).toBeLessThanOrEqual(1);
    // 滚动区自己不挂遮罩：mask 会把 sticky 表头关进它自己的层叠上下文、压到表头背衬下面。
    expect(await fadeState(scroller)).toMatchObject({ fade: null });
    // 自绘滚动条在遮罩外面，不会被淡掉。
    const scrollbarOutside = await page
      .locator("[data-vt-scrollbar='y']")
      .evaluate((el) => el.closest("[data-scroll-fade]") === null);
    expect(scrollbarOutside).toBe(true);
  });

  test("卡片区（ScrollArea）默认渐隐，旁边的下拉面板走 portal、不在遮罩里", async ({ page }) => {
    await mock(page);
    await page.goto("/#/access/ai-accounts");
    await expect(page.getByText("account-1@example.com").first()).toBeVisible();
    // 卡片多到一屏放不下，在卡片区里滚：卡片区挂着遮罩，钉满一屏的外壳不挂。
    const cards = cardViewport(page);
    await expect
      .poll(() => fadeState(cards))
      .toMatchObject({ fade: "y", top: false, bottom: true });
    expect(await fadeState(mainScroller(page))).toMatchObject({ fade: null });
    await scrollTo(cards, 120);
    await expect.poll(() => fadeState(cards)).toMatchObject({ top: true, bottom: true });

    await page.getByRole("combobox", { name: "状态" }).click();
    const listbox = page.getByRole("listbox").first();
    await expect(listbox).toBeVisible();
    const insideMask = await listbox.evaluate(
      (el) => el.parentElement?.closest("[data-scroll-fade]") != null,
    );
    expect(insideMask).toBe(false);
  });
});

const shots = process.env.SCROLL_FADE_SHOTS;

test.describe("截图走查", () => {
  test.skip(!shots, "设置 SCROLL_FADE_SHOTS 才截图");

  for (const [width, height] of [
    [1280, 720],
    [1470, 900],
  ] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`${width}×${height} ${scheme}`, async ({ page }) => {
        test.slow();
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height });
        await mock(page);
        const shoot = async (name: string) => {
          await page.mouse.move(width / 2, 4); // 指针停在顶栏空白处，不留悬停提示
          await page.waitForTimeout(450); // 渐隐长度的过渡走完
          await page.screenshot({ path: `${shots}/${width}x${height}-${scheme}-${name}.png` });
        };

        await page.goto("/#/runtime/privacy-masking");
        await expect(page.getByRole("heading", { name: "没让上游看到的" })).toBeVisible();
        await page.waitForTimeout(2600); // 流向图的线画完
        // 头卡的标题正好滑进页签栏下面的渐隐带：用户截图里被一刀切断的就是这里。
        await scrollTo(mainScroller(page), 90);
        await shoot("1-privacy-masking");

        await page.locator("li button").filter({ hasText: "gpt-5-codex" }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await shoot("4-drawer-record");
        await page.keyboard.press("Escape");

        await page.getByRole("button", { name: "外观" }).click();
        const appearance = page.getByRole("dialog", { name: "外观" });
        await expect(appearance.getByText("配色", { exact: true })).toBeVisible();
        const appearanceBody = appearance.locator("[data-scroll-fade-host]").first();
        await appearanceBody.hover();
        await page.mouse.wheel(0, 180);
        await expect.poll(() => appearanceBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        await shoot("5-drawer-appearance");
        await page.keyboard.press("Escape");
        await expect(appearance).toBeHidden();

        // 宽屏两栏：右侧「试一试」是 sticky 侧栏，停在页签栏下方渐隐带以下，不被淡掉。
        await page.getByRole("tab", { name: "设置" }).click();
        await expect(page.getByText("要遮什么")).toBeVisible();
        await scrollTo(mainScroller(page), 260);
        await shoot("6-privacy-settings");

        await page.goto("/#/runtime/request-logs");
        await expect(page.locator("tr[data-vt-row-index]").first()).toBeVisible();
        await scrollTo(page.locator("[data-scrollbar-visibility='hover']").first(), 200);
        await shoot("2-request-logs");

        await page.goto("/#/access/ai-accounts");
        await expect(page.getByText("account-1@example.com").first()).toBeVisible();
        await scrollTo(cardViewport(page), 200);
        await shoot("3-ai-accounts");
      });
    }
  }
});
