import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * 表格的高度模型。整页列表（fill）：表格占满标题、筛选、分页之外剩下的高度，加载中、为空、
 * 行少、行多都是同一个框，分页条和横向滚动条不随行数移动；嵌在表单、弹窗、两栏里的小表才按
 * 行数收高。
 *
 * 来回改过两次：最早 DataTable 默认钉成视口高度（h-[calc(100dvh-260px)]），嵌在表单里的小表
 * 也留一整屏空白；#1085 改成一律按行数收高，整页列表行少时表格只到页面中间、横向滚动条悬在
 * 页面中部，首次加载时骨架只有五行高、数据回来再整块撑开。2026-11-05 用户看了上线效果：
 * 表格应该默认占满可视区域、离窗口底部留间距。这里按用户截图里的情形量几何，不靠截图对比：
 *
 * - 行少：表格框仍延伸到分页条上方，空白留在框里；分页条贴在窗口底部，横向滚动条贴着框底边。
 * - 首次加载：骨架铺满同一个框，数据回来时框和分页条都不动。
 * - 行多：表格占满剩余高度、在内部滚动，分页条在窗口里，整页不滚。
 * - 敏感词：宽屏两栏钉满一屏，列表滚到底时顶部标签和左侧清单不动，分页条和保存栏一直看得见。
 */

const DEFAULTS = {
  action: "block",
  replacement: "***",
  scan_scope: "all_user",
  block_message: "Your request was blocked by the content policy.",
  reply_filter: false,
  fold_traditional_chinese: false,
};
const LIMITS = {
  max_rules: 10000,
  max_regex: 50,
  max_keyword_chars: 128,
  max_regex_bytes: 512,
  max_regex_program: 500,
  max_regex_program_total: 2000,
  max_note_chars: 200,
  max_replacement_chars: 64,
  max_block_message_chars: 500,
};

const policyView = (scope: string, rules: number) => ({
  exists: rules > 0,
  scope_type: scope,
  enabled: true,
  action: "",
  replacement: "",
  scan_scope: "",
  reply_filter: null,
  fold_traditional_chinese: null,
  inherit_tenant: true,
  block_message: "",
  version: 1,
  rules: Array.from({ length: rules }, (_, i) => ({ id: `r${i}`, kind: "keyword", pattern: `词${i}`, enabled: true })),
  effective: DEFAULTS,
  rule_count: rules,
  rules_hidden: false,
  unbounded_regex_ids: [],
  can_edit: true,
  limits: LIMITS,
});

const brief = (scope: string, rules: number) => ({
  exists: rules > 0,
  scope_type: scope,
  enabled: true,
  action: "",
  scan_scope: "",
  reply_filter: null,
  rule_count: rules,
  version: 1,
});

async function mockAdmin(page: Page, { endUsers = 6, portalUsers = 33, platformRules = 45 } = {}) {
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
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/v0/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/v0\/management/, "");
    if (path === "/end-users") {
      return json(route, {
        items: Array.from({ length: endUsers }, (_, i) => ({
          id: `eu-${i}`,
          tenant_id: "t1",
          username: `user-${i}`,
          display_name: `用户 ${i}`,
          status: "active",
          must_change_password: false,
          created_at: "2026-05-13T15:32:00Z",
          updated_at: "2026-05-13T15:32:00Z",
          version: 1,
          api_key_count: 1,
        })),
      });
    }
    if (path === "/content-moderation/profiles") {
      return json(route, { items: [], capabilities: { word_guard: true, secret_masking: true, word_portal: true } });
    }
    if (path === "/content-moderation/word-policies") {
      return json(route, {
        defaults: DEFAULTS,
        limits: LIMITS,
        guard_enabled: true,
        can_manage_platform: true,
        platform: brief("platform", platformRules),
        tenant: brief("tenant", 0),
        keys: [],
        portal: { default_allowed: false, policies: 0, active_policies: 0 },
      });
    }
    if (path === "/content-moderation/word-policies/portal") {
      return json(route, {
        default_allowed: false,
        limits: LIMITS,
        users: Array.from({ length: portalUsers }, (_, i) => ({
          id: `pu-${i}`,
          username: `portal-${i}`,
          display_name: `门户账号 ${i}`,
          status: "active",
          override: null,
          allowed: false,
          policy: null,
        })),
      });
    }
    if (path === "/content-moderation/word-policies/platform") return json(route, policyView("platform", platformRules));
    if (path === "/content-moderation/word-policies/tenant") return json(route, policyView("tenant", 0));
    if (path === "/update/check") return json(route, { has_update: false });
    return json(route, { items: [], files: [], data: [], total: 0, config: {} });
  });
}

const rectOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height };
  });

/** 外壳的滚动容器（<main> 的父级）还能往下滚多少。 */
const outerOverflow = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.getElementById("main-content")?.parentElement;
    return scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
  });

test.describe("整页列表：表格占满剩余高度，框不随行数变", () => {
  test.use({ viewport: { width: 1470, height: 800 } });

  test("行少时表格框仍延伸到分页条上方，分页条贴在窗口底部，横向滚动条贴着框底边", async ({ page }) => {
    await mockAdmin(page, { endUsers: 6 });
    await page.goto("/#/access/end-users");
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(6);

    const lastRow = await rectOf(page, "tr[data-vt-row-index='5']");
    const frame = await rectOf(page, "[data-scrollbar-visibility='hover']");
    const pager = await rectOf(page, "text=第 1-6 条，共 6 条");
    // 空白留在框里：框的底边离最后一行还远，紧挨着分页条。
    expect(frame.bottom - lastRow.bottom).toBeGreaterThan(200);
    expect(pager.top - frame.bottom).toBeLessThan(24);
    // 分页条在窗口底部（下面只剩外壳的底部内边距），不是悬在页面中间。
    expect(800 - pager.bottom).toBeLessThan(48);
    expect(await outerOverflow(page)).toBeLessThanOrEqual(1);
    // 横向滚动条（有的话）贴着框的底边，在分页条上方，不跟着最后一行跑到页面中间。
    const scrollbar = page.locator("[data-vt-scrollbar='x']");
    if ((await scrollbar.count()) > 0) {
      const bar = await scrollbar.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(frame.bottom - bar).toBeLessThanOrEqual(8);
    }
  });

  test("首次加载时骨架铺满同一个框，数据回来时框和分页条都不动", async ({ page }) => {
    await mockAdmin(page, { endUsers: 6 });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // 后注册的路由先匹配：把列表接口挡住，量完加载中的框再放行给 mockAdmin。
    await page.route(/\/v0\/management\/end-users(\?|$)/, async (route) => {
      await gate;
      await route.fallback();
    });
    await page.goto("/#/access/end-users");
    await expect(page.locator("tbody tr[aria-hidden='true']").first()).toBeAttached();
    const loadingFrame = await rectOf(page, "[data-scrollbar-visibility='hover']");
    expect(await page.locator("tbody tr[aria-hidden='true']").count()).toBeGreaterThan(5);

    release();
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(6);
    const loadedFrame = await rectOf(page, "[data-scrollbar-visibility='hover']");
    expect(Math.abs(loadedFrame.top - loadingFrame.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(loadedFrame.bottom - loadingFrame.bottom)).toBeLessThanOrEqual(1);
  });

  test("行多时表格占满剩余高度、在内部滚动，分页条常驻在窗口里", async ({ page }) => {
    await mockAdmin(page, { endUsers: 40 });
    await page.goto("/#/access/end-users");
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(20);

    const viewport = page.locator("[data-scrollbar-visibility='hover']").first();
    const sizes = await viewport.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    const pager = await rectOf(page, "text=第 1-20 条，共 40 条");
    expect(pager.bottom).toBeLessThanOrEqual(800);
    expect(await outerOverflow(page)).toBeLessThanOrEqual(1);
  });
});

test.describe("敏感词：宽屏两栏钉满一屏", () => {
  test.use({ viewport: { width: 1470, height: 800 } });

  test("门户账号列表滚到底时，顶部标签和左侧清单不动，分页条一直看得见", async ({ page }) => {
    await mockAdmin(page, { portalUsers: 33 });
    await page.goto("/#/access/content-moderation");
    const rail = page.getByRole("navigation", { name: "规则集" });
    await rail.getByRole("button", { name: /门户账号/ }).click();
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(20);

    const pageTab = page.getByRole("tab", { name: "敏感词", exact: true });
    const tabBefore = await pageTab.boundingBox();
    const railBefore = await rail.boundingBox();

    const viewport = page.locator("[data-scrollbar-visibility='hover']").first();
    await viewport.hover();
    await page.mouse.wheel(0, 4000);
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    // 滚的是列表自己，整页没动：标签、左栏都还在原处。
    expect(await outerOverflow(page)).toBeLessThanOrEqual(1);
    expect((await pageTab.boundingBox())?.y).toBe(tabBefore?.y);
    expect((await rail.boundingBox())?.y).toBe(railBefore?.y);
    const pager = await rectOf(page, "text=第 1-20 条，共 33 条");
    expect(pager.bottom).toBeLessThanOrEqual(800);
  });

  test("词表多于一页时分页条和保存栏都在窗口里，命中处理在另一页", async ({ page }) => {
    await mockAdmin(page, { platformRules: 45 });
    await page.goto("/#/access/content-moderation");
    await page.getByRole("navigation", { name: "规则集" }).getByRole("button", { name: /平台规则/ }).click();
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(20);

    await page.getByRole("textbox", { name: "添加敏感词" }).fill("新词");
    await page.getByRole("button", { name: "添加", exact: true }).click();
    const saveBar = await rectOf(page, "[role='region'][aria-label='有未保存的修改']");
    const pager = await rectOf(page, "text=第 1-20 条，共 46 条");
    expect(saveBar.bottom).toBeLessThanOrEqual(800);
    expect(pager.bottom).toBeLessThanOrEqual(saveBar.top);
    expect(await outerOverflow(page)).toBeLessThanOrEqual(1);

    // 命中后怎么处理在「命中处理」页，标签上直接写着现在的处理方式；切过去保存栏还在。
    await page.getByRole("tab", { name: /命中处理 拦截请求/ }).click();
    await expect(page.getByRole("radio", { name: /拦截请求/ })).toBeChecked();
    await expect(page.getByRole("region", { name: "有未保存的修改" })).toBeVisible();
    // 切回词表，搜索和页码这类列表状态还在（两页都挂着，只是隐藏）。
    await page.getByRole("tab", { name: /词表/ }).click();
    await expect(page.locator("tr[data-vt-row-index]")).toHaveCount(20);
  });
});
