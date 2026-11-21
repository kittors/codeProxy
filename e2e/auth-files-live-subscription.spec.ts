import { expect, test, type Page } from "@playwright/test";

// Once the backend reads the provider's billing (Codex accounts/check), the
// status API carries the live cycle. It must win over a manual start time the
// file still holds: that one is "start + one month" and was two days off the
// real renewal on 2026-11-20. Accounts without a live read keep the manual
// countdown and the manual inputs.
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const expiresAt = new Date(now + 20 * DAY - 3_600_000).toISOString();
const renewsAt = new Date(now + 20 * DAY - 7 * 3_600_000).toISOString();
const checkedAt = new Date(now - 2 * 3_600_000).toISOString();
// Manual start eight days ago: one month on, 22 or 23 days remain, never 20.
const manualStart = new Date(now - 8 * DAY).toISOString();

const authFile = (name: string, label: string, authIndex: string) => ({
  id: name,
  name,
  label,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: authIndex,
  auth_subject_id: `sub-${authIndex}`,
  disabled: false,
  size: 1024,
  modified: now - DAY,
  subscription_started_at: manualStart,
  subscription_period: "monthly",
});

const authFiles = [
  authFile("codex-live.json", "Codex Live", "live-a"),
  authFile("codex-manual.json", "Codex Manual", "manual-b"),
];

const statusItem = (authIndex: string, subscription: Record<string, unknown>) => ({
  auth_index: authIndex,
  auth_subject_id: `sub-${authIndex}`,
  provider: "codex",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 1,
  refresh_state: "success",
  health_status: "ok",
  plan_type: "pro",
  quotas: [],
  usage: {
    request_total: 0,
    success_total: 0,
    failure_total: 0,
    cycle_request_total: 0,
    cycle_known: true,
    updated_at: checkedAt,
  },
  version: 3,
  upstream_checked_at: checkedAt,
  updated_at: checkedAt,
  ...subscription,
});

const statusItems = [
  statusItem("live-a", {
    subscription_expires_at: expiresAt,
    subscription_renews_at: renewsAt,
    subscription_source: "probe",
    subscription_state: "active",
    subscription_period: "monthly",
    subscription_checked_at: checkedAt,
  }),
  statusItem("manual-b", {}),
];

const openPage = async (page: Page, viewMode: "cards" | "table") => {
  await page.addInitScript((mode) => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "test-management-key",
        rememberPassword: true,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }),
    );
    localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify(mode));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  }, viewMode);
  await page.route("**/v0/management/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/ai-accounts/status")) return json({ items: statusItems });
    if (path.includes("/ai-accounts/status-refresh"))
      return json({
        job_id: "j",
        state: "completed",
        total: 2,
        completed: 2,
        failed: 0,
        results: [],
      });
    if (path.endsWith("/auth-files/download"))
      return json({
        type: "codex",
        account_type: "oauth",
        subscription_started_at: manualStart,
        subscription_period: "monthly",
      });
    if (path.endsWith("/auth-files/models")) return json({ models: [] });
    if (path.endsWith("/auth-files")) return json({ files: authFiles });
    if (path.endsWith("/model-configs") || path.endsWith("/model-owner-presets")) return json([]);
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/usage/auth-file-trend"))
      return json({
        auth_index: url.searchParams.get("auth_index") ?? "",
        days: 7,
        hours: 5,
        request_total: 0,
        cycle_request_total: 0,
        cycle_cost_total: 0,
        weekly_quota_used_percent: null,
        cycle_start: "",
        daily_usage: [],
        hourly_usage: [],
        quota_series: [],
      });
    if (path.endsWith("/usage")) return json({ apis: {} });
    if (path.endsWith("/config")) return json({});
    if (path.endsWith("/update/check")) return json({ update_available: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
};

test("a live billing read drives the card badge over the manual start time", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page, "cards");
  await expect(page.getByTestId("auth-files-cards")).toBeVisible();

  const live = page.locator('[data-subscription-source="live"]');
  await expect(live).toHaveText("剩余 20 天");
  await expect(page.locator('[data-subscription-source="manual"]')).toHaveText(/剩余 2[23] 天/);

  await live.hover();
  await expect(page.getByText(/自动续费于/)).toBeVisible();
  await page.screenshot({ path: "/tmp/auth-files-live-subscription-cards.png" });
});

test("the details show the live read instead of the manual inputs", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page, "table");

  const liveRow = page.locator("tr", { hasText: "Codex Live" });
  await expect(liveRow.locator('[data-subscription-source="live"]')).toBeVisible();
  await liveRow.getByRole("button", { name: /Details|详情/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /Fields|字段/i }).click();
  await expect(dialog.getByText("订阅时间（自动获取）")).toBeVisible();
  await expect(dialog.getByText(/自动续费于/)).toBeVisible();
  await expect(dialog.getByText("订阅开始时间", { exact: true })).toHaveCount(0);
  await dialog.screenshot({ path: "/tmp/auth-files-live-subscription-detail.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const manualRow = page.locator("tr", { hasText: "Codex Manual" });
  await manualRow.getByRole("button", { name: /Details|详情/i }).click();
  await page
    .getByRole("dialog")
    .getByRole("tab", { name: /Fields|字段/i })
    .click();
  await expect(page.getByRole("dialog").getByText("订阅开始时间", { exact: true })).toBeVisible();
});
