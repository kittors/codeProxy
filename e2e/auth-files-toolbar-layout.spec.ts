import { expect, test, type Page } from "@playwright/test";

const observedAt = new Date().toISOString();

const authFiles = ["alias-a", "alias-b", "alias-c"].map((idx, i) => ({
  id: `auth-${idx}`,
  name: `account-${i}@example.com.json`,
  label: `account-${i}@example.com`,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: idx,
  auth_subject_id: `sub-${idx}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + i,
}));

const statusItems = authFiles.map((f) => ({
  auth_index: f.auth_index,
  auth_subject_id: f.auth_subject_id,
  provider: "codex",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 1,
  refresh_state: "success",
  health_status: "ok",
  plan_type: "pro_20x",
  subscription_expires_at: "2026-08-27T00:00:00Z",
  subscription_source: "signed_claims",
  quotas: [
    {
      quota_key: "code_week",
      quota_label: "m_quota.code_weekly",
      percent: 12,
      reset_at: "2026-08-09T06:38:11Z",
      window_seconds: 604800,
      observed_at: observedAt,
    },
  ],
  usage: {
    request_total: 30568,
    success_total: 30507,
    failure_total: 61,
    success_rate: 0.998,
    cycle_request_total: 30568,
    cycle_total_tokens: 3_900_000_000,
    cycle_known: true,
    updated_at: observedAt,
  },
  version: 4,
  upstream_checked_at: observedAt,
  quota_observed_at: observedAt,
  updated_at: observedAt,
}));

const openPage = async (page: Page) => {
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
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/ai-accounts/status")) return json({ items: statusItems });
    if (path.includes("/ai-accounts/status-refresh"))
      return json({ job_id: "j", state: "completed", total: 0, completed: 0, failed: 0, results: [] });
    if (path.endsWith("/auth-files")) return json({ files: authFiles });
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/usage/auth-file-trend")) return json({ points: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
  await expect(page.getByTestId("auth-files-cards")).toBeVisible();
};

const rowEdges = async (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-testid="auth-files-mobile-filter-panel"]');
    if (!panel) return null;
    const stack = panel.firstElementChild;
    if (!stack) return null;
    const [filterRow, actionRow] = [...stack.children];
    if (!filterRow || !actionRow) return null;
    const toolbar = panel.closest("div.shrink-0");
    return {
      filterRight: Math.round(filterRow.getBoundingClientRect().right),
      actionRight: Math.round(actionRow.getBoundingClientRect().right),
      rowCount: stack.children.length,
      toolbarHeight: toolbar ? Math.round(toolbar.getBoundingClientRect().height) : null,
    };
  });

// The filter row used to stop a column short of the action row because the grid
// declared a fixed five tracks while only four fields rendered, leaving the two
// rows visibly misaligned at every desktop width.
for (const width of [1280, 1440, 1920, 2560]) {
  test(`filter and action rows end flush at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openPage(page);

    const edges = await rowEdges(page);
    expect(edges).not.toBeNull();
    expect(edges!.rowCount).toBe(2);
    expect(Math.abs(edges!.filterRight - edges!.actionRight)).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `/tmp/toolbar-${width}.png`, fullPage: false });
  });
}

// Selecting files used to append a third row, so the toolbar grew and pushed the
// card grid down mid-interaction.
test("selecting files does not change the toolbar height", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await openPage(page);

  const before = await rowEdges(page);
  expect(before).not.toBeNull();

  const firstCard = page.getByTestId("auth-files-cards").locator("section").first();
  await firstCard.hover();
  await firstCard.getByRole("checkbox").first().check();
  await expect(page.getByText(/已选/)).toBeVisible();

  const after = await rowEdges(page);
  expect(after!.rowCount).toBe(before!.rowCount);
  expect(after!.toolbarHeight).toBe(before!.toolbarHeight);

  await page.screenshot({ path: "/tmp/toolbar-selected.png", fullPage: false });
});
