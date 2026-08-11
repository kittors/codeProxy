import { expect, test, type Page } from "@playwright/test";

// xAI reports an unfunded balance as "$0.00 / $0.00". The card used to print it
// next to the countdown, spending a line to say the account has no budget out of
// no budget. A funded balance must still show.
const authFiles = [
  {
    id: "auth-alias-a",
    name: "grok-zero@example.com.json",
    label: "grok-zero@example.com",
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

const resetAt = new Date(Date.now() + 20 * 86_400_000).toISOString();
const observedAt = new Date().toISOString();

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
    quotas: [
      {
        quota_key: "monthly_credits",
        quota_label: "xai_quota.monthly_credits",
        percent: 100,
        reset_at: resetAt,
        window_seconds: 2592000,
        meta: "$0.00 / $0.00",
        observed_at: observedAt,
      },
      {
        quota_key: "pay_as_you_go",
        quota_label: "xai_quota.pay_as_you_go",
        percent: 40,
        reset_at: resetAt,
        window_seconds: 2592000,
        meta: "$12.50 / $50.00",
        observed_at: observedAt,
      },
    ],
    version: 4,
    upstream_checked_at: observedAt,
    quota_observed_at: observedAt,
    updated_at: observedAt,
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
      return json({ job_id: "j", state: "completed", total: 1, completed: 1, failed: 0, results: [] });
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

test("an all-zero balance is dropped while a funded one still shows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page);

  const card = page.getByTestId("auth-files-cards").locator("section").first();
  await expect(card.getByText("$12.50 / $50.00")).toBeVisible();
  await expect(card.getByText("$0.00 / $0.00")).toHaveCount(0);
  // The countdown that shared the line stays.
  await expect(card.getByText(/重置/).first()).toBeVisible();

  await page.screenshot({ path: "/tmp/auth-files-zero-money.png", fullPage: false });
});
