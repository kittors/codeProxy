import { expect, test, type Page } from "@playwright/test";

// Two xAI accounts in a four-column grid: the narrowest card the page can draw,
// and the one where the countdown and the percentage compete for the same line.
const authFiles = ["a", "b"].map((suffix, index) => ({
  id: `auth-alias-${suffix}`,
  name: `grok-${suffix}@example.com.json`,
  label: `grok-${suffix}@example.com`,
  type: "xai",
  provider: "xai",
  account_type: "oauth",
  auth_index: `alias-${suffix}`,
  auth_subject_id: `sub-alias-${suffix}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + index,
}));

const observedAt = new Date().toISOString();
// Just under eight days: long enough that the full countdown carries every unit
// ("7天22小时35分57秒"), which is what used to run under the percentage.
const resetAt = new Date(Date.now() + 7 * 86_400_000 + 22 * 3_600_000 + 2157_000).toISOString();

const quotaFor = (percent: number) => [
  {
    quota_key: "weekly_limit",
    quota_label: "xai_quota.weekly_limit",
    percent,
    reset_at: resetAt,
    window_seconds: 604_800,
    observed_at: observedAt,
  },
  {
    quota_key: "monthly_credits",
    quota_label: "xai_quota.monthly_credits",
    percent: 100,
    reset_at: resetAt,
    window_seconds: 2_592_000,
    observed_at: observedAt,
  },
];

const statusItems = authFiles.map((file, index) => ({
  auth_index: file.auth_index,
  auth_subject_id: file.auth_subject_id,
  provider: "xai",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 1,
  refresh_state: "success",
  health_status: "ok",
  plan_type: "supergrok",
  quotas: quotaFor(index === 0 ? 78 : 94),
  version: 4,
  upstream_checked_at: observedAt,
  quota_observed_at: observedAt,
  updated_at: observedAt,
}));

type RouteOptions = {
  /** Held forever, to park the page on its cold-list placeholder. */
  holdAuthFiles?: boolean;
  /** Held forever, to park a card on its in-flight quota placeholder. */
  holdStatusRefresh?: boolean;
  /** Status payload; defaults to accounts that already report quota. */
  items?: unknown[];
};

const openPage = async (page: Page, options: RouteOptions = {}) => {
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
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.setItem("authFilesPage.cardColumns.v1", JSON.stringify(4));
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/auth-files")) {
      if (options.holdAuthFiles) return new Promise(() => {});
      return json({ files: authFiles });
    }
    if (path.endsWith("/ai-accounts/status")) return json({ items: options.items ?? statusItems });
    if (path.includes("/ai-accounts/status-refresh")) {
      if (options.holdStatusRefresh) return new Promise(() => {});
      return json({
        job_id: "j",
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      });
    }
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/usage/auth-file-trend")) return json({ points: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
};

test("cold list draws card-shaped placeholders, not table rows", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openPage(page, { holdAuthFiles: true });

  const skeletons = page.getByTestId("auth-files-card-skeleton");
  await expect(skeletons.first()).toBeVisible();
  expect(await skeletons.count()).toBeGreaterThan(1);

  await page.screenshot({ path: "/tmp/auth-files-cold-skeleton.png", fullPage: false });
});

test("a card probing for the first time shows quota-bar placeholders", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  // Accounts known to the page but with no quota recorded yet.
  await openPage(page, {
    items: statusItems.map((item) => ({ ...item, quotas: [] })),
    holdStatusRefresh: true,
  });

  const card = page.getByTestId("auth-files-cards").locator("section").first();
  await expect(card.getByTestId("auth-file-card-quota-empty")).toBeVisible();

  await card.getByRole("button", { name: "刷新" }).first().click();
  await expect(card.getByTestId("auth-file-card-quota-skeleton")).toBeVisible();
  await expect(card.getByTestId("auth-file-card-quota-empty")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/auth-files-quota-skeleton.png", fullPage: false });
});

test("the countdown never runs under the percentage on a narrow card", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openPage(page);

  const card = page.getByTestId("auth-files-cards").locator("section").first();
  await expect(card.getByText("78%")).toBeVisible();

  const detail = card.getByTestId("quota-bar-detail").first();
  await expect(detail).toBeVisible();

  const detailBox = await detail.boundingBox();
  const percentBox = await card.getByText("78%").first().boundingBox();
  expect(detailBox).not.toBeNull();
  expect(percentBox).not.toBeNull();
  // The countdown ends before the percentage starts, with the row's own gap
  // between them — it is not merely clipped at the percentage's edge.
  expect(detailBox!.x + detailBox!.width).toBeLessThanOrEqual(percentBox!.x);

  // The abbreviated countdown fits without ellipsis; the full value is on hover.
  const detailText = (await detail.innerText()).trim();
  expect(detailText).not.toContain("…");
  await expect(detail).toHaveAttribute("title", /秒/);

  await page.screenshot({ path: "/tmp/auth-files-quota-countdown.png", fullPage: false });
});
