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

  // remember=true → durable localStorage snapshot (single admin session, no multi-account vault).
  const snapshot = await page.evaluate(() => localStorage.getItem("code-proxy-admin-auth"));
  expect(snapshot).toBeTruthy();
  expect(snapshot).toContain("cps_test");
  expect(snapshot).toContain("expiresAt");
  expect(await page.evaluate(() => sessionStorage.getItem("code-proxy-admin-auth"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("code-proxy-admin-auth-accounts"))).toBeNull();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/#\/dashboard$/);
});

test("Login: a throttled refresh keeps the session instead of signing the user out @critical", async ({
  page,
}) => {
  // The reported failure loop: the panel refreshes, the server answers 429
  // because the IP bucket is already full, and the old client treated that as
  // "session dead" — signing the user out into a login page that also 429s.
  let refreshAttempts = 0;
  await page.route("**/v0/auth/refresh", async (route) => {
    refreshAttempts += 1;
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "login_rate_limited", message: "too many" } }),
    });
  });
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_expired", message: "expired" } }),
    }),
  );
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_stale",
        refreshToken: "cpr_adm_stale",
        rememberPassword: true,
        expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
        expiresAtMs: Date.now() - 1000,
        refreshExpiresAtMs: Date.now() + 7 * 24 * 3600 * 1000,
        rotationSeq: 1,
      }),
    );
  });

  await page.goto("/#/dashboard");
  await page.waitForTimeout(3000);

  expect(refreshAttempts).toBeGreaterThan(0);
  // A rate-limited refresh says nothing about whether the grant is still valid,
  // so the stored session must survive it.
  const snapshot = await page.evaluate(() => localStorage.getItem("code-proxy-admin-auth"));
  expect(snapshot).toBeTruthy();
  expect(snapshot).toContain("cpr_adm_stale");
});

test("Login: an invalidated session stops all management traffic @critical", async ({ page }) => {
  // The tail of the reported failure. Once the session is gone the panel used to
  // keep polling without a token, and the server counted each of those as a
  // failed auth attempt — which is how a user who never typed a wrong password
  // ended up locked out with "too many login attempts".
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_revoked", message: "revoked" } }),
    }),
  );
  // An explicitly revoked grant is the one case where signing out is correct.
  await page.route("**/v0/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "session_revoked", message: "revoked" } }),
    }),
  );
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.addInitScript(() => {
    localStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_revoked",
        refreshToken: "cpr_adm_revoked",
        rememberPassword: true,
        expiresAt: Date.now() + 30 * 24 * 3600 * 1000,
        expiresAtMs: Date.now() + 3600 * 1000,
        refreshExpiresAtMs: Date.now() + 7 * 24 * 3600 * 1000,
        rotationSeq: 1,
      }),
    );
  });

  await page.goto("/#/dashboard");
  await expect(page).toHaveURL(/#\/login/, { timeout: 15_000 });

  // Only traffic after the gate closed matters; the bootstrap attempt itself is
  // expected to reach the server.
  const afterInvalidation: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/v0/management/")) afterInvalidation.push(request.url());
  });
  await page.waitForTimeout(3000);

  expect(afterInvalidation).toEqual([]);
});
