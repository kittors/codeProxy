import { expect, test } from "@playwright/test";
import {
  SYSTEM_AUTH_FILES,
  SYSTEM_PROXY_POOL,
  TENANT_AUTH_FILES,
  TENANT_PROXY_POOL,
  routeManagementMocks,
  setAuthed,
} from "./fixtures/platformSharing";

/*
 * Platform-shared proxies and AI accounts (CliRelay resource grants), against a mocked management
 * API: the platform administrator in the system tenant shares and adopts, a granted tenant sees
 * the shared resources read-only. The backend declares the feature with `sharing.supported`.
 */

test.describe("platform-shared resources", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await setAuthed(page);
  });

  test("system tenant shares a proxy and switches overriding tenants to it", async ({ page }) => {
    const { writes } = await routeManagementMocks(page, { proxyPool: SYSTEM_PROXY_POOL });
    await page.goto("/#/models/proxies");

    await expect(page.getByRole("columnheader", { name: "Sharing" })).toBeVisible();
    const hkRow = page.locator("tr", { hasText: "HK residential" });
    await expect(hkRow.getByTestId("resource-sharing-badge")).toHaveText("Shared with 2 tenants");
    await expect(
      page.locator("tr", { hasText: "SG datacenter" }).getByTestId("resource-sharing-badge"),
    ).toHaveText("Shared with all tenants");
    await expect(page.locator("tr", { hasText: "US West" })).toContainText("Not shared");

    await page.getByRole("button", { name: "Sharing for US West" }).click();
    const dialog = page.getByRole("dialog", { name: "Share proxy US West" });
    await dialog.getByRole("radio", { name: /Share with specific tenants/ }).click();
    await dialog.getByRole("combobox", { name: "Tenants" }).click();
    const listbox = page.getByRole("listbox");
    await expect(listbox.getByRole("option", { name: /System Administration/ })).toHaveCount(0);
    await listbox.getByRole("option", { name: "土豆服务器" }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    expect(writes).toContainEqual({
      method: "PUT",
      path: "/proxy-pool/us-west/sharing",
      body: { all: false, tenant_ids: ["t-potato"] },
    });

    await hkRow.getByTestId("proxy-overridden-by").click();
    const confirm = page.getByRole("dialog", {
      name: "Switch tenants to the shared HK residential",
    });
    await expect(confirm).toContainText("无境科技");
    await confirm.getByRole("button", { name: "Switch to shared" }).click();
    await expect(
      page.getByText("Switched 1 tenant to the shared HK residential: 无境科技"),
    ).toBeVisible();
    expect(writes).toContainEqual({
      method: "POST",
      path: "/proxy-pool/hk-residential/adopt",
      body: null,
    });
  });

  test("granted tenant sees platform proxies read-only and can drop its override", async ({
    page,
  }) => {
    const { writes } = await routeManagementMocks(page, { proxyPool: TENANT_PROXY_POOL });
    await page.goto("/#/models/proxies");

    await expect(page.getByRole("heading", { name: "Platform-shared proxies" })).toBeVisible();
    const sharedTable = page.getByRole("table", { name: "Platform-shared proxies table" });
    const sgRow = sharedTable.locator("tr", { hasText: "SG datacenter" });
    await expect(sgRow).toContainText("45.38.111.81:5996");
    await expect(sgRow).toContainText("86 ms");
    await expect(
      sharedTable
        .locator("tr", { hasText: "HK residential" })
        .getByTestId("shared-proxy-overridden"),
    ).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Sharing" })).toHaveCount(0);
    await expect(page.getByTestId("proxy-overrides-shared")).toBeVisible();

    await page.getByRole("button", { name: "Use platform proxy for My HK" }).click();
    const confirm = page.getByRole("dialog", { name: "Switch My HK to the platform proxy" });
    await confirm.getByRole("button", { name: "Use platform proxy" }).click();
    await expect(page.getByText("My HK now uses the platform proxy")).toBeVisible();
    expect(writes).toContainEqual({ method: "PUT", path: "/proxy-pool", body: { items: [] } });
  });

  test("system tenant shares AI accounts in bulk", async ({ page }) => {
    const { writes } = await routeManagementMocks(page, { authFiles: SYSTEM_AUTH_FILES });
    await page.goto("/#/access/ai-accounts");

    const opsCard = page.locator('[class*="group/card"]', { hasText: "Codex Ops" });
    await expect(opsCard.getByTestId("resource-sharing-badge")).toHaveText("Shared with 1 tenant");
    await expect(opsCard.getByTestId("auth-file-tenant-copies")).toHaveText("1 tenant has a copy");

    // Selection checkboxes only fade in while the card is hovered.
    const teamCard = page.locator('[class*="group/card"]', { hasText: "Codex Team" });
    await opsCard.hover();
    await opsCard.getByRole("checkbox", { name: "Select Codex Ops" }).check();
    await teamCard.hover();
    await teamCard.getByRole("checkbox", { name: "Select Codex Team" }).check();
    await page.getByRole("button", { name: "Share (2)" }).click();
    const dialog = page.getByRole("dialog", { name: "Share 2 accounts" });
    await expect(dialog).toContainText("These 2 accounts are shared differently");
    await dialog.getByRole("radio", { name: /Share with all tenants/ }).click();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Sharing updated for 2 accounts")).toBeVisible();
    expect(writes).toContainEqual({
      method: "PUT",
      path: "/auth-files/sharing",
      body: { ids: ["codex-ops.json", "codex-team.json"], all: true, tenant_ids: [] },
    });
    await expect(teamCard.getByTestId("resource-sharing-badge")).toHaveText(
      "Shared with all tenants",
    );
  });

  test("granted tenant browses platform-shared accounts read-only", async ({ page }) => {
    await routeManagementMocks(page, { authFiles: TENANT_AUTH_FILES });
    await page.goto("/#/access/ai-accounts");

    const own = page.locator('[class*="group/card"]', { hasText: "My Codex" });
    await expect(own.getByTestId("auth-file-duplicates-shared")).toHaveText(
      "Duplicates a platform account",
    );

    await page.getByRole("tab", { name: "Platform-shared 2" }).click();
    const table = page.getByRole("table", { name: "Platform-shared accounts table" });
    await expect(table.locator("tr", { hasText: "Codex Ops" })).toContainText("ops@example.com");
    await expect(table.locator("tr", { hasText: "Codex Ops" })).toContainText("Available");
    await expect(table.locator("tr", { hasText: "Claude Max" })).toContainText("Disabled");
    await expect(table.locator("tbody").getByRole("button")).toHaveCount(0);
  });
});
