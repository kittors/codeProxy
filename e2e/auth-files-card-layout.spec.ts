import { expect, test, type Page } from "@playwright/test";

// Three accounts that between them exercise every row-3 combination: one plain,
// one with a fault badge, one with neither subscription nor fault. The card
// header must keep the same three-row shape in all of them.
const accounts = [
  { idx: "alias-a", name: "jd7njnb5nh@privaterelay.appleid.com", plan: "pro_20x", expires: "2026-08-27T00:00:00Z", error: false, pct: 12 },
  { idx: "alias-b", name: "lanlanjiaxin@proton.me", plan: "pro_20x", expires: "2026-09-04T00:00:00Z", error: true, pct: 0 },
  { idx: "alias-c", name: "tyktgyk@gmail.com", plan: "pro_20x", expires: "2026-08-18T00:00:00Z", error: false, pct: 8 },
];

const authFiles = accounts.map((a, i) => ({
  id: `auth-${a.idx}`,
  name: `${a.name}.json`,
  label: a.name,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: a.idx,
  auth_subject_id: `sub-${a.idx}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000 + i,
}));

// Fresh enough that the staleness marker stays off and the layout is what a
// healthy account actually looks like.
const observedAt = new Date().toISOString();

const statusItems = accounts.map((a) => ({
  auth_index: a.idx,
  auth_subject_id: `sub-${a.idx}`,
  provider: "codex",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  subject_seed_kind: "account_id",
  current_tenant_binding_count: 1,
  refresh_state: a.error ? "error" : "success",
  health_status: a.error ? "error" : "ok",
  plan_type: a.plan,
  subscription_expires_at: a.expires,
  subscription_source: "signed_claims",
  error_code: a.error ? "429" : undefined,
  error_message: a.error ? "Requests are limited" : undefined,
  quotas: [
    {
      quota_key: "code_week",
      quota_label: "m_quota.code_weekly",
      percent: a.pct,
      reset_at: "2026-08-08T06:38:11Z",
      window_seconds: 604800,
      observed_at: observedAt,
    },
    {
      quota_key: "additional:codex_bengalfox:week",
      quota_label: "GPT-5.3-Codex-Spark: Weekly",
      percent: 100,
      reset_at: "2026-08-15T00:00:00Z",
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

const setAuthed = async (page: Page, columns: number) => {
  await page.addInitScript(
    ([cols]) => {
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
      localStorage.setItem("authFilesPage.cardColumns.v1", JSON.stringify(cols));
      localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
    },
    [columns],
  );
};

const routeMocks = async (page: Page) => {
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
    if (path.endsWith("/model-configs")) return json({ items: [] });
    if (path.endsWith("/model-owner-presets")) return json({ items: [] });
    if (path.endsWith("/proxy-pool")) return json({ items: [] });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({});
  });
};

const openCards = async (page: Page, columns: number) => {
  await setAuthed(page, columns);
  await routeMocks(page);
  await page.goto("/#/access/ai-accounts");
  await expect(page.getByTestId("auth-files-cards")).toBeVisible();
  await expect(page.getByText("tyktgyk@gmail.com")).toBeVisible();
};

// The header rows must be structurally identical across widths. Before this
// layout, "remaining days" sat in the metrics row on wide cards and wrapped down
// to its own row on narrow ones, so no two card sizes agreed on the shape.
for (const columns of [2, 4]) {
  test(`card header keeps a stable three-row shape at ${columns} columns`, async ({ page }) => {
    await page.setViewportSize({ width: 2000, height: 900 });
    await openCards(page, columns);

    const cards = page.getByTestId("auth-files-cards").locator("section");
    await expect(cards).toHaveCount(3);

    await page.screenshot({ path: `/tmp/card-layout-${columns}col.png`, fullPage: false });

    for (let i = 0; i < 3; i += 1) {
      const card = cards.nth(i);
      // Plan badge belongs to the metrics row, never the title row.
      await expect(card.getByTestId("auth-file-plan-badge")).toHaveCount(1);
      await expect(card.getByTestId("auth-file-card-status-badges")).toHaveCount(1);
    }
  });
}
