import { expect, test, type Page } from "@playwright/test";

// 两启用一禁用：既验证「已启用」选项存在，也验证它确实按 disabled 的补集过滤。
const authFiles = [
  { idx: "alias-a", disabled: false },
  { idx: "alias-b", disabled: true },
  { idx: "alias-c", disabled: false },
].map((entry, i) => ({
  id: `auth-${entry.idx}`,
  name: `account-${i}@example.com.json`,
  label: `account-${i}@example.com`,
  type: "codex",
  provider: "codex",
  account_type: "oauth",
  auth_index: entry.idx,
  auth_subject_id: `sub-${entry.idx}`,
  disabled: entry.disabled,
  size: 1024,
  modified: 1784534400000 + i,
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
    if (path.endsWith("/ai-accounts/status")) return json({ items: [] });
    if (path.includes("/ai-accounts/status-refresh"))
      return json({
        job_id: "j",
        state: "completed",
        total: 0,
        completed: 0,
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

test("status filter can narrow AI accounts down to the enabled ones", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPage(page);

  const cards = page.getByTestId("auth-files-cards").locator("section");
  await expect(cards).toHaveCount(3);

  await page.getByRole("combobox", { name: "状态" }).click();
  const enabledOption = page.getByRole("option", { name: /已启用/ });
  await expect(enabledOption).toBeVisible();
  await enabledOption.click();

  await expect(cards).toHaveCount(2);
  await expect(page.getByText("account-1@example.com")).toHaveCount(0);

  await page.screenshot({ path: "/tmp/auth-files-status-enabled.png", fullPage: false });
});
