import { expect, test, type Page } from "@playwright/test";

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
  permissions: [
    "platform.tenants.read",
    "platform.tenants.create",
    "platform.tenants.update",
    "tenant.users.read",
    "tenant.users.create",
    "tenant.users.update",
    "tenant.users.assign_roles",
    "tenant.users.reset_password",
    "tenant.users.delete",
    "tenant.roles.read",
    "tenant.roles.create",
    "tenant.roles.update",
    "tenant.roles.delete",
    "tenant.audit.read",
    "dashboard.read",
  ],
  platform_admin: true,
};

async function mockIdentity(page: Page) {
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
}

test("logs in with username and password without selecting a tenant", async ({
  page,
}) => {
  await page.route("**/v0/auth/login", async (route) => {
    const body = route.request().postDataJSON();
    expect(body).toEqual({
      username: "admin",
      password: "correct-password",
      remember_me: false,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "cps_test",
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        principal: {
          ...principal,
          user: { ...principal.user, must_change_password: true },
        },
      }),
    });
  });
  await mockIdentity(page);
  await page.goto("/#/login");
  await expect(page.getByLabel(/tenant/i)).toHaveCount(0);
  await page.getByLabel(/username/i).fill("admin");
  await page.getByLabel(/^password$/i).fill("correct-password");
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(
    page.getByRole("heading", { name: /change password/i }),
  ).toBeVisible();
});

test("shows tenant governance routes from server permissions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await mockIdentity(page);
  await page.goto("/#/tenants");
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New tenant" })).toBeVisible();
  await expect(page.getByText("System Administration").first()).toBeVisible();
});

test("creates a tenant without selecting it on the login page", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await mockIdentity(page);
  let createBody: Record<string, unknown> | null = null;
  await page.route("**/v0/management/tenants", async (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          tenant: { ...principal.home_tenant, id: "tenant-a" },
          admin: principal.user,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [principal.home_tenant] }),
    });
  });
  await page.goto("/#/tenants");
  await page.getByRole("button", { name: "New tenant" }).click();
  await page.getByLabel("Slug", { exact: true }).fill("tenant-a");
  await page.getByLabel("Name", { exact: true }).fill("Tenant A");
  await page.getByLabel("Expires at", { exact: true }).fill("2030-01-01T00:00");
  await page.getByLabel("Admin username", { exact: true }).fill("tenant-admin");
  await page
    .getByLabel("Admin display name", { exact: true })
    .fill("Tenant Admin");
  await page
    .getByLabel("Admin password", { exact: true })
    .fill("tenant-password-123");
  await page.getByLabel("Description", { exact: true }).fill("Primary tenant");
  await page.getByRole("button", { name: "Create tenant" }).click();
  await expect.poll(() => createBody).not.toBeNull();
  expect(createBody).toMatchObject({
    slug: "tenant-a",
    name: "Tenant A",
    admin_username: "tenant-admin",
    admin_display_name: "Tenant Admin",
    admin_password: "tenant-password-123",
    description: "Primary tenant",
  });
});

test("users page does not fetch or expose role assignment without role read permission", async ({
  page,
}) => {
  const limitedPrincipal = {
    ...principal,
    platform_admin: false,
    home_tenant: {
      ...principal.home_tenant,
      id: "tenant-limited",
      type: "standard",
    },
    effective_tenant: {
      ...principal.effective_tenant,
      id: "tenant-limited",
      type: "standard",
    },
    user: {
      ...principal.user,
      id: "u-limited",
      tenant_id: "tenant-limited",
      username: "manager",
    },
    permissions: ["tenant.users.read"],
  };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_limited",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principal: limitedPrincipal }),
    }),
  );
  let roleRequests = 0;
  await page.route("**/v0/management/roles", (route) => {
    roleRequests += 1;
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/v0/management/users", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            ...limitedPrincipal.user,
            display_name: "Limited Manager",
            role_ids: ["role-reader"],
            role_codes: ["reader"],
          },
        ],
      }),
    }),
  );

  await page.goto("/#/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(page.getByText("Limited Manager")).toBeVisible();
  await expect(page.getByText("reader")).toBeVisible();
  await expect(page.getByRole("button", { name: "New user" })).toHaveCount(0);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  expect(roleRequests).toBe(0);
});

test("renders role, audit, and password governance pages from server permissions", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await mockIdentity(page);

  await page.goto("/#/roles");
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  await page.goto("/#/audit-logs");
  await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
  await page.goto("/#/change-password");
  await expect(
    page.getByRole("heading", { name: "Change password" }),
  ).toBeVisible();
});

test("shows an expired tenant message when restoring a rejected session", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_expired",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "tenant_expired", message: "tenant expired" },
      }),
    }),
  );

  await page.goto("/#/dashboard");
  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByText(/tenant has expired/i)).toBeVisible();
});

test("provider read permission hides tenant write/test controls and system-only Ampcode", async ({
  page,
}) => {
  const providerReader = {
    ...principal,
    platform_admin: false,
    home_tenant: {
      ...principal.home_tenant,
      id: "tenant-provider-reader",
      type: "standard",
    },
    effective_tenant: {
      ...principal.effective_tenant,
      id: "tenant-provider-reader",
      type: "standard",
    },
    user: {
      ...principal.user,
      id: "u-provider-reader",
      tenant_id: "tenant-provider-reader",
      username: "provider-reader",
    },
    permissions: ["providers.read"],
  };
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_provider_reader",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    );
    localStorage.setItem("providers-page:tab", "opencode-go");
  });
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principal: providerReader }),
    }),
  );

  let forbiddenAuxiliaryRequests = 0;
  await page.route("**/v0/management/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v0/management", "");
    if (
      path.startsWith("/usage/") ||
      path.startsWith("/proxy-pool") ||
      path.startsWith("/model-path-availability") ||
      path.endsWith("/usage")
    ) {
      forbiddenAuxiliaryRequests += 1;
    }
    const bodies: Record<string, unknown> = {
      "/gemini-api-key": { "gemini-api-key": [] },
      "/claude-api-key": { "claude-api-key": [] },
      "/codex-api-key": { "codex-api-key": [] },
      "/opencode-go-api-key": {
        "opencode-go-api-key": [
          {
            "api-key": "sk-read-only",
            name: "Read only provider",
            "workspace-id": "workspace-reader",
            "auth-cookie": "auth=reader",
          },
        ],
      },
      "/cline-api-key": { "cline-api-key": [] },
      "/ollama-cloud-api-key": { "ollama-cloud-api-key": [] },
      "/vertex-api-key": { "vertex-api-key": [] },
      "/bedrock-api-key": { "bedrock-api-key": [] },
      "/openai-compatibility": { "openai-compatibility": [] },
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bodies[path] ?? {}),
    });
  });

  await page.goto("/#/ai-providers/opencode-go/new");
  await expect(
    page.getByText("Read only provider", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ampcode" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /add new/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /import json/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /more actions/i })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: /refresh usage/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(forbiddenAuxiliaryRequests).toBe(0);
});

test("standard tenant redirects the unavailable OAuth excluded tab to tenant-safe aliases", async ({
  page,
}) => {
  const tenantAuthAdmin = {
    ...principal,
    platform_admin: false,
    home_tenant: {
      ...principal.home_tenant,
      id: "tenant-auth-admin",
      type: "standard",
    },
    effective_tenant: {
      ...principal.effective_tenant,
      id: "tenant-auth-admin",
      type: "standard",
    },
    user: {
      ...principal.user,
      id: "u-auth-admin",
      tenant_id: "tenant-auth-admin",
      username: "auth-admin",
    },
    permissions: ["auth_files.read", "auth_files.oauth"],
  };
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_auth_admin",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    ),
  );
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principal: tenantAuthAdmin }),
    }),
  );
  let excludedRequests = 0;
  await page.route("**/v0/management/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      "/v0/management",
      "",
    );
    if (path === "/oauth-excluded-models") excludedRequests += 1;
    const body =
      path === "/auth-files"
        ? { files: [] }
        : path === "/oauth-model-alias"
          ? { "oauth-model-alias": {} }
          : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.goto("/#/auth-files?tab=excluded");
  await expect(page).toHaveURL(/#\/account-security\?tab=excluded$/);
  await expect(page.getByRole("tab", { name: /model aliases/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /excluded models/i })).toHaveCount(
    0,
  );
  expect(excludedRequests).toBe(0);
});
