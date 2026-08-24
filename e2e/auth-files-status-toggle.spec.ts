import { expect, test, type Page } from "@playwright/test";

// Selection toolbar used to expose "禁用" only, so an account switched off from
// there could never be switched back on without hunting for the per-card power
// button. Both directions are covered here.
type AuthFile = {
  id: string;
  name: string;
  label: string;
  type: string;
  provider: string;
  account_type: string;
  auth_index: string;
  auth_subject_id: string;
  disabled: boolean;
  size: number;
  modified: number;
};

const buildFiles = (): AuthFile[] =>
  [
    { idx: "alias-a", disabled: false },
    { idx: "alias-b", disabled: false },
  ].map((entry, i) => ({
    id: `auth-${entry.idx}`,
    name: `codex-${i}@example.com.json`,
    label: `codex-${i}@example.com`,
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
  const files = buildFiles();
  const patched: { name: string; disabled: boolean }[] = [];

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
    localStorage.setItem("authFilesPage.cardColumns.v1", JSON.stringify(4));
    localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    localStorage.setItem("cli-proxy-language", JSON.stringify("zh-CN"));
  });
  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.endsWith("/auth-files/status") && request.method() === "PATCH") {
      const body = JSON.parse(request.postData() ?? "{}") as { name: string; disabled: boolean };
      patched.push(body);
      const target = files.find((file) => file.name === body.name);
      if (target) target.disabled = body.disabled;
      return json({ status: "ok", disabled: body.disabled });
    }
    if (path.endsWith("/ai-accounts/status")) return json({ items: [] });
    if (path.includes("/ai-accounts/status-refresh"))
      return json({ job_id: "j", state: "completed", total: 0, completed: 0, failed: 0, results: [] });
    if (path.endsWith("/auth-files")) return json({ files });
    if (path.endsWith("/usage/entity-stats")) return json({ source: [], auth_index: [] });
    if (path.endsWith("/usage/auth-file-trend")) return json({ points: [] });
    if (path.endsWith("/config")) return json({ config: {} });
    if (path.endsWith("/update/check")) return json({ has_update: false });
    return json({ items: [] });
  });
  await page.goto("/#/access/ai-accounts");
  await expect(page.getByTestId("auth-files-cards")).toBeVisible();
  return { files, patched };
};

test("card power button toggles an account off and back on", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { patched } = await openPage(page);

  const toggle = page.getByRole("button", { name: "启用/禁用" }).first();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  expect(patched.map((entry) => entry.disabled)).toEqual([true, false]);
});

test("selection toolbar can disable and re-enable the selected accounts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { files, patched } = await openPage(page);

  // Selection checkboxes only fade in on card hover until something is selected.
  const cards = page.getByTestId("auth-files-cards").locator("section");
  const checkboxes = page.getByTestId("auth-files-cards").getByRole("checkbox");
  await cards.first().hover();
  await checkboxes.first().check();
  await checkboxes.nth(1).check();
  await expect(page.getByText("已选 2 项")).toBeVisible();

  await page.getByRole("button", { name: "禁用", exact: true }).click();
  await expect.poll(() => files.filter((file) => file.disabled).length).toBe(2);
  await expect(page.getByRole("button", { name: "启用/禁用" }).first()).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.getByRole("button", { name: "启用", exact: true }).click();
  await expect.poll(() => files.filter((file) => file.disabled).length).toBe(0);
  await expect(page.getByRole("button", { name: "启用/禁用" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  expect(patched.filter((entry) => entry.disabled)).toHaveLength(2);
  expect(patched.filter((entry) => !entry.disabled)).toHaveLength(2);
});
