import { expect, test } from "@playwright/test";

const principal = {
  kind: "user_session",
  user: {
    id: "u-admin",
    tenant_id: "t-system",
    username: "admin",
    display_name: "Administrator",
    status: "active",
    must_change_password: false,
    last_login_at: null,
    version: 1,
    created_at: "",
    updated_at: "",
  },
  home_tenant: {
    id: "t-system",
    slug: "system",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
    expires_at: null,
    description: "",
    version: 1,
    created_at: "",
    updated_at: "",
  },
  effective_tenant: {
    id: "t-system",
    slug: "system",
    name: "System Administration",
    type: "system",
    status: "active",
    effective_status: "active",
    expires_at: null,
    description: "",
    version: 1,
    created_at: "",
    updated_at: "",
  },
  roles: [],
  permissions: ["dashboard.read", "monitor.read"],
  platform_admin: true,
};

test("Login: successful sign in persists auth snapshot and restores dashboard after reload @critical", async ({
  page,
}) => {
  await page.route("**/v0/auth/login", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      username: "admin",
      password: "correct-password",
      remember_me: true,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "cps_test",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        principal,
      }),
    });
  });
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principal }),
    }),
  );
  await page.route("**/v0/management/tenants", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [principal.home_tenant] }),
    }),
  );
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/#/login");
  await page.evaluate(() => {
    localStorage.removeItem("code-proxy-admin-auth");
    sessionStorage.removeItem("code-proxy-admin-auth");
  });

  await page.getByLabel(/username/i).fill("admin");
  await page.getByLabel(/^password$/i).fill("correct-password");
  await page.getByRole("checkbox", { name: /remember/i }).check();
  await page.getByRole("button", { name: /^login$/i }).click();

  await expect(page).toHaveURL(/#\/dashboard$/);

  // Active session is always sessionStorage (per-tab); vault may also land in localStorage.
  const sessionSnapshot = await page.evaluate(() => sessionStorage.getItem("code-proxy-admin-auth"));
  expect(sessionSnapshot).toBeTruthy();
  expect(sessionSnapshot).toContain("cps_test");
  expect(sessionSnapshot).toContain("expiresAt");

  const vault = await page.evaluate(() => localStorage.getItem("code-proxy-admin-auth-accounts"));
  expect(vault).toBeTruthy();
  expect(vault).toContain("cps_test");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/#\/dashboard$/);
});
