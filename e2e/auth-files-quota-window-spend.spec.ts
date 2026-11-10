import { expect, test, type Locator, type Page } from "@playwright/test";

// CliRelay#1103: each quota window shows what the proxy spent inside it, beside
// the countdown and the share. Windows the backend has no figure for (code
// review here) show no amount at all rather than $0.00.
const authFile = (id: string, name: string, provider: string) => ({
  id: `auth-${id}`,
  name: `${name}.json`,
  label: name,
  type: provider,
  provider,
  account_type: "oauth",
  auth_index: id,
  auth_subject_id: `sub-${id}`,
  disabled: false,
  size: 1024,
  modified: 1784534400000,
});

const authFiles = [
  authFile("codex-spend", "codex-spend@example.com", "codex"),
  authFile("agy-spend", "agy-spend@example.com", "antigravity"),
];

const observedAt = new Date().toISOString();
const resetIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const window = (
  quota_key: string,
  quota_label: string,
  percent: number,
  hours: number,
  window_seconds: number,
  used_cost_usd?: number,
) => ({
  quota_key,
  quota_label,
  percent,
  reset_at: resetIn(hours),
  window_seconds,
  observed_at: observedAt,
  ...(used_cost_usd === undefined ? {} : { used_cost_usd }),
});

const status = (id: string, provider: string, quotas: unknown[]) => ({
  auth_index: id,
  auth_subject_id: `sub-${id}`,
  provider,
  plan_type: "pro",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 1,
  refresh_state: "success",
  health_status: "ok",
  quotas,
  version: 4,
  upstream_checked_at: observedAt,
  quota_observed_at: observedAt,
  updated_at: observedAt,
});

const statusItems = [
  status("codex-spend", "codex", [
    window("code_5h", "m_quota.code_5h", 40, 3, 18000, 12.34),
    window("code_week", "m_quota.code_weekly", 75, 96, 604800, 48.5),
    window("review_5h", "m_quota.review_5h", 100, 5, 18000),
  ]),
  // The longest row a card has to fit: the upstream's own group names, a
  // multi-day countdown and a four-figure amount.
  status("agy-spend", "antigravity", [
    window("antigravity:3p_weekly", "Claude and GPT models", 12, 150, 604800, 1234.56),
    window("antigravity:3p_5h", "Claude and GPT models", 100, 5, 18000, 0),
    window("antigravity:gemini_weekly", "Gemini Models", 64, 150, 604800, 87.2),
    window("antigravity:gemini_5h", "Gemini Models", 93, 4, 18000, 3.05),
  ]),
];

const openPage = async (page: Page, columns: number) => {
  await page.addInitScript((cols) => {
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
  }, columns);
  await page.route("**/v0/management/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/ai-accounts/status"))
      return json({ items: statusItems, capabilities: { "quota-window-spend": true } });
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

const cardFor = (page: Page, name: string) =>
  page.getByTestId("auth-files-cards").locator("section").filter({ hasText: name });

// The amount sits between the countdown and the share on one line: it must
// end before the share starts and not wrap the line.
const expectAmountBesideShare = async (spend: Locator) => {
  const share = spend.locator("xpath=following-sibling::span[1]");
  const [spendBox, shareBox, lineBox] = await Promise.all([
    spend.boundingBox(),
    share.boundingBox(),
    spend.locator("..").boundingBox(),
  ]);
  expect(spendBox && shareBox && lineBox).toBeTruthy();
  if (!spendBox || !shareBox || !lineBox) return;
  expect(spendBox.x + spendBox.width).toBeLessThanOrEqual(shareBox.x + 0.5);
  expect(shareBox.x + shareBox.width).toBeLessThanOrEqual(lineBox.x + lineBox.width + 0.5);
  expect(
    Math.abs(spendBox.y + spendBox.height / 2 - (shareBox.y + shareBox.height / 2)),
  ).toBeLessThan(3);
};

for (const columns of [3, 4]) {
  test(`each window shows its spend beside the share at ${columns} columns`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openPage(page, columns);

    const codex = cardFor(page, "codex-spend@example.com");
    const codexSpend = codex.getByTestId("quota-bar-spend");
    // Code review has no figure, so it shows none rather than $0.00.
    await expect(codexSpend).toHaveCount(2);
    await expect(codexSpend.nth(0)).toHaveText("$12.34");
    await expect(codexSpend.nth(1)).toHaveText("$48.50");
    // 60% of the 5h window used for $12.34: the whole window is about $20.57.
    await expect(codexSpend.nth(0)).toHaveAttribute("title", /\$20\.57/);
    // 25% of the week used for $48.50: about $194.00.
    await expect(codexSpend.nth(1)).toHaveAttribute("title", /\$194\.00/);

    const agySpend = cardFor(page, "agy-spend@example.com").getByTestId("quota-bar-spend");
    await expect(agySpend).toHaveCount(4);
    await expect(agySpend.filter({ hasText: "$1,235" })).toHaveCount(1);
    await expect(agySpend.filter({ hasText: "$0.00" })).toHaveCount(1);

    for (const spend of [...(await codexSpend.all()), ...(await agySpend.all())]) {
      await expectAmountBesideShare(spend);
    }

    // Both third-party rows are "Claude and GPT · <window>": with the amount on
    // the line the group name truncates, never the window that tells them apart.
    const windows = cardFor(page, "agy-spend@example.com").getByTestId("quota-bar-label-suffix");
    await expect(windows).toHaveCount(4);
    for (const suffix of await windows.all()) {
      expect(await suffix.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.screenshot({
      path: `/tmp/auth-files-quota-window-spend-${columns}col.png`,
      fullPage: false,
    });
  });
}
