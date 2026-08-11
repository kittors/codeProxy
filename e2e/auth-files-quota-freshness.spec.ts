import { expect, test, type Page } from "@playwright/test";

// Deliberately six hours old: the panel used to date such a window ("6小时前的数据")
// and desaturate its bar, which mostly fired during the force probe every page
// entry already runs. The card must now look identical to a just-observed one.
const staleObservedAt = new Date(Date.now() - 6 * 3_600_000).toISOString();

const authFiles = [
  {
    id: "auth-alias-a",
    name: "grok-primary@example.com.json",
    label: "grok-primary@example.com",
    type: "xai",
    provider: "xai",
    account_type: "oauth",
    auth_index: "alias-a",
    auth_subject_id: "sub-alias-a",
    disabled: false,
    size: 1024,
    modified: 1784534400000,
  },
];

const statusItems = [
  {
    auth_index: "alias-a",
    auth_subject_id: "sub-alias-a",
    provider: "xai",
    status_scope: "shared_subject",
    subject_scope: "shared",
    share_eligible: true,
    current_tenant_binding_count: 1,
    refresh_state: "success",
    health_status: "ok",
    plan_type: "pro_20x",
    quotas: [
      {
        quota_key: "weekly_limit",
        quota_label: "m_quota.code_weekly",
        percent: 99,
        reset_at: "2026-08-16T00:00:00Z",
        window_seconds: 604800,
        observed_at: staleObservedAt,
      },
    ],
    usage: {
      request_total: 764,
      success_total: 745,
      failure_total: 19,
      success_rate: 0.975,
      cycle_request_total: 764,
      cycle_known: true,
      updated_at: staleObservedAt,
    },
    version: 4,
    upstream_checked_at: staleObservedAt,
    quota_observed_at: staleObservedAt,
    updated_at: staleObservedAt,
  },
];

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
      return json({
        job_id: "j",
        state: "completed",
        total: 1,
        completed: 1,
        failed: 0,
        results: [],
      });
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

test("a quota observed hours ago is neither dated nor dimmed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page);

  const card = page.getByTestId("auth-files-cards").locator("section").first();
  await expect(card.getByText("99%")).toBeVisible();

  // No age text in any form: the removed keys would fall back to their raw id.
  await expect(card.getByText(/前的数据|stale_observed|stale_never_observed/)).toHaveCount(0);
  // No desaturated fill and no amber meta row.
  await expect(card.locator(".saturate-50")).toHaveCount(0);
  await expect(card.locator(".text-amber-600")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/auth-files-quota-freshness.png", fullPage: false });
});
