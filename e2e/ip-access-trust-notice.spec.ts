import { expect, test, type Page } from "@playwright/test";

/**
 * IP 访问页的状态提醒（TrustBanner）不能推动页面。
 *
 * 状态是 /ip-access/status 异步读回来的。以前提醒是标题上方单独一整行，读回来那一刻把标题、页签、
 * 筛选和表格整体往下推 36–43px（dev 上本来就有，计划 104 第二阶段逐帧检查时发现）。现在提醒是标题行里
 * 的一枚胶囊，这里把状态接口卡住、量一次位置，放行后等提醒出现再量一次，两次必须一致；
 * 「访问控制未生效」点一下直接去「防护策略」页签。
 */

const healthy = {
  client_ip: "203.0.113.9",
  trusted: true,
  relay_header: "",
  trusted_proxies_configured: true,
  enforced: true,
  lockdown: false,
  active_rules: 3,
  storage_available: true,
  auto_ban_mode: "observe",
};

const policy = {
  policy: {
    lockdown: false,
    auto_ban: { mode: "observe", window_seconds: 600, failure_threshold: 20, ban_minutes: 60, max_ban_minutes: 1440 },
    throttle: {
      login_failure_window_seconds: 0,
      account_failure_limit: 0,
      management_key_failure_limit: 0,
      unauthenticated_request_limit: 0,
      failure_reset_hours: 0,
    },
    alert: { notify_observe: false, cooldown_minutes: 30 },
    attempt_retention_days: 30,
  },
  throttle: [],
};

async function openIpAccess(page: Page, status: Record<string, unknown>) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: window.location.origin,
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/ip-access/status")) {
      await gate;
      return json(status);
    }
    if (url.pathname.endsWith("/ip-access/policy")) return json(policy);
    if (url.pathname.endsWith("/config")) return json({});
    return json({ items: [] });
  });
  await page.goto("/#/governance/ip-access");
  await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: 15_000 });
  // 等路由进场动画（整页 8px 滑入）走完再量。
  await page.waitForTimeout(600);
  return { release };
}

/** 相对页面根的纵向位置：量的是内容在页面里的位置，不受外壳滚动影响。 */
const offsets = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector("[data-page-fill]")?.getBoundingClientRect();
    const top = (selector: string) => {
      const el = document.querySelector(selector);
      return el && root ? el.getBoundingClientRect().top - root.top : null;
    };
    const header = document.querySelector("[data-ip-access-header]")?.getBoundingClientRect();
    return {
      tabs: top('[role="tablist"]'),
      grid: top(".sn-tbl-wrap"),
      headerHeight: header?.height ?? null,
    };
  });

test.describe("IP access trust notice", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("没配 trusted-proxies：提醒出现在标题行里，页签与表格不被推下去，点一下去防护策略", async ({
    page,
  }) => {
    const { release } = await openIpAccess(page, {
      ...healthy,
      client_ip: "172.17.0.1",
      trusted: false,
      relay_header: "X-Forwarded-For",
      trusted_proxies_configured: false,
      enforced: false,
      suggested_trusted_proxies: ["172.17.0.1/32"],
    });
    const before = await offsets(page);
    expect(before.tabs).not.toBeNull();

    release();
    const notice = page.locator('[data-ip-access-header] [data-ip-access-notice="danger"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("访问控制未生效");
    const after = await offsets(page);
    expect(Math.abs((after.tabs ?? 0) - (before.tabs ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((after.grid ?? 0) - (before.grid ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((after.headerHeight ?? 0) - (before.headerHeight ?? 0))).toBeLessThanOrEqual(1);

    // 补充说明在悬停提示里：客户端地址与修复入口
    await notice.hover();
    await expect(page.getByRole("tooltip")).toContainText("172.17.0.1");

    await notice.click();
    await expect(page.getByRole("tab", { name: "防护策略" })).toHaveAttribute("aria-selected", "true");
  });

  test("未启用数据库存储：提醒同样留在标题行里，不推动内容，也不是按钮", async ({ page }) => {
    const { release } = await openIpAccess(page, { ...healthy, storage_available: false });
    const before = await offsets(page);

    release();
    const notice = page.locator('[data-ip-access-header] [data-ip-access-notice="warning"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("未启用数据库存储");
    expect(await notice.evaluate((node) => node.tagName)).not.toBe("BUTTON");
    const after = await offsets(page);
    expect(Math.abs((after.tabs ?? 0) - (before.tabs ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((after.grid ?? 0) - (before.grid ?? 0))).toBeLessThanOrEqual(1);
  });

  test("状态正常时不出提醒，自动封禁显示模式名而不是键名", async ({ page }) => {
    const { release } = await openIpAccess(page, healthy);
    release();
    const header = page.locator("[data-ip-access-header]");
    await expect(header).toContainText("仅观察");
    await expect(header.locator("[data-ip-access-notice]")).toHaveCount(0);
    await expect(header).not.toContainText("auto_ban_mode");
  });
});
