import { expect, test, type Page } from "@playwright/test";

const administratorRole = {
  id: "r-platform-admin",
  tenant_id: "t-system",
  code: "platform_super_admin",
  name: "Administrator",
  description: "Built-in administrator role with every platform and tenant permission.",
  scope: "platform",
  system_protected: true,
  permissions: [
    "platform.tenants.read",
    "platform.tenants.create",
    "platform.tenants.update",
    "platform.menus.read",
    "platform.menus.update",
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
  version: 1,
};

const principal = {
  kind: "user_session",
  user: {
    id: "u-admin",
    tenant_id: "t-system",
    username: "admin",
    display_name: "Super Administrator",
    status: "active",
    must_change_password: false,
    last_login_at: null,
    role_ids: [administratorRole.id],
    role_codes: [administratorRole.code],
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
  roles: [administratorRole],
  permissions: [
    "platform.tenants.read",
    "platform.tenants.create",
    "platform.tenants.update",
    "platform.menus.read",
    "platform.menus.update",
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

const operatorRole = {
  id: "r-operator",
  tenant_id: "t-system",
  code: "operator",
  name: "Operator",
  description: "Operates tenant users.",
  scope: "tenant",
  system_protected: false,
  permissions: ["tenant.users.read", "tenant.users.update"],
  version: 2,
};

const memberUser = {
  ...principal.user,
  id: "u-member",
  username: "member",
  display_name: "Member User",
  role_ids: [operatorRole.id],
  role_codes: [operatorRole.code],
  version: 3,
};

const menuItems = [
  {
    code: "group.system",
    parent_code: "",
    type: "directory",
    path: "",
    label_key: "shell.nav_group_system",
    icon: "settings",
    permission_code: "",
    sort_order: 60,
    visible: true,
    enabled: true,
    system_protected: true,
    version: 1,
  },
  {
    code: "system.menus",
    parent_code: "group.system",
    type: "menu",
    path: "/menu-management",
    label_key: "shell.nav_menu_management",
    icon: "menu",
    permission_code: "platform.menus.read",
    sort_order: 40,
    visible: true,
    enabled: true,
    system_protected: true,
    version: 1,
  },
  {
    code: "system.config",
    parent_code: "group.system",
    type: "menu",
    path: "/config",
    label_key: "shell.nav_config",
    icon: "settings",
    permission_code: "system.config.read",
    sort_order: 30,
    visible: true,
    enabled: true,
    system_protected: true,
    version: 1,
  },
];

const roleMenuItems = [
  {
    code: "group.governance",
    parent_code: "",
    type: "directory",
    path: "",
    label_key: "shell.nav_group_governance",
    icon: "users-round",
    permission_code: "",
    sort_order: 50,
    visible: true,
    enabled: true,
    system_protected: true,
    version: 1,
  },
  {
    code: "governance.users",
    parent_code: "group.governance",
    type: "menu",
    path: "/users",
    label_key: "shell.nav_users",
    icon: "user-round",
    permission_code: "tenant.users.read",
    sort_order: 20,
    visible: true,
    enabled: true,
    system_protected: true,
    version: 1,
  },
];

const standardTenant = {
  ...principal.home_tenant,
  id: "t-acme",
  slug: "acme",
  name: "Acme Team",
  type: "standard",
};

async function mockIdentity(
  page: Page,
  tenants = [principal.home_tenant],
  roles = [administratorRole],
  users = [principal.user],
  menus = menuItems,
  principalMenus?: typeof roleMenuItems,
) {
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        principal: principalMenus ? { ...principal, menus: principalMenus } : principal,
      }),
    }),
  );
  await page.route("**/v0/management/**", (route) => {
    const path = new URL(route.request().url()).pathname.replace("/v0/management", "");
    const bodies: Record<string, unknown> = {
      "/tenants": { items: tenants },
      "/users": { items: users },
      "/roles": { items: roles },
      "/menus": { items: menus },
      "/permissions": {
        items: administratorRole.permissions.map((code) => ({
          code,
          name: code,
          scope: code.startsWith("platform.") ? "platform" : "tenant",
          resource:
            code.startsWith("tenant.") || code.startsWith("platform.")
              ? (code.split(".")[1] ?? "")
              : code.split(".").slice(0, -1).join("_"),
          action: code.split(".").at(-1),
          menu_code:
            code.startsWith("tenant.users.") || code.startsWith("platform.users.")
              ? "governance.users"
              : "",
          sensitive: false,
        })),
      },
      "/audit-logs": { items: [] },
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(bodies[path] ?? {}),
    });
  });
}

test("logs in with username and password without selecting a tenant", async ({ page }) => {
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
  await expect(page.locator("svg.lucide-key-round")).toBeVisible();
  const usernameBox = await page.getByLabel(/username/i).boundingBox();
  const passwordBox = await page.getByLabel(/^password$/i).boundingBox();
  expect(usernameBox?.height).toBeGreaterThanOrEqual(44);
  expect(passwordBox?.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel(/username/i).fill("admin");
  await page.getByLabel(/^password$/i).fill("correct-password");
  await page.getByRole("button", { name: /^login$/i }).click();
  await expect(page.getByRole("heading", { name: /change password/i })).toBeVisible();
  await expect(page.locator("main svg.lucide-key-round")).toHaveCount(0);
  await expect(page.locator("main svg.lucide-eye")).toHaveCount(0);
  const passwordVisibility = page.getByRole("checkbox", { name: /show passwords/i });
  await expect(passwordVisibility).toBeVisible();
  await expect(page.getByLabel(/current password/i)).toHaveAttribute("type", "password");
  await passwordVisibility.check();
  await expect(page.getByLabel(/current password/i)).toHaveAttribute("type", "text");
  await expect(page.getByLabel(/^new password$/i)).toHaveAttribute("type", "text");
  await expect(page.getByLabel(/confirm new password/i)).toHaveAttribute("type", "text");
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
  await expect
    .poll(async () => {
      const passwordCard = await page.locator("main section").boundingBox();
      const viewport = page.viewportSize();
      if (!passwordCard || !viewport) return Number.POSITIVE_INFINITY;
      return Math.abs(passwordCard.x + passwordCard.width / 2 - viewport.width / 2);
    })
    .toBeLessThan(12);
  await expect
    .poll(async () => {
      const passwordCard = await page.locator("main section").boundingBox();
      const viewport = page.viewportSize();
      if (!passwordCard || !viewport) return Number.POSITIVE_INFINITY;
      return Math.abs(passwordCard.y + passwordCard.height / 2 - viewport.height / 2);
    })
    .toBeLessThan(12);
  await page.evaluate(() => {
    window.location.hash = "/dashboard";
  });
  await expect(page).toHaveURL(/#\/change-password$/);
});

test("shows tenant governance routes from server permissions", async ({ page }) => {
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

test("uses the localized borderless tenant dropdown menu", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "code-proxy-admin-auth",
      JSON.stringify({
        apiBase: "http://127.0.0.1:8317",
        managementKey: "cps_test",
        rememberPassword: false,
        expiresAt: Date.now() + 60_000,
      }),
    );
    localStorage.setItem(
      "cli-proxy-language",
      JSON.stringify({ language: "zh-CN", state: { language: "zh-CN" } }),
    );
  });
  await mockIdentity(page, [principal.home_tenant, standardTenant]);
  await page.goto("/#/tenants");

  const trigger = page.getByRole("button", { name: "切换租户" });
  await expect(trigger).toContainText("系统管理");
  await expect(trigger).not.toContainText("System Administration");
  await expect
    .poll(() => trigger.evaluate((element) => getComputedStyle(element).borderTopWidth))
    .toBe("0px");

  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "系统管理" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(menu.getByRole("menuitem", { name: "Acme Team" })).toBeVisible();
});

test("shows tenant row actions including protected system tenant details", async ({ page }) => {
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
  await mockIdentity(page, [principal.home_tenant, standardTenant]);
  await page.goto("/#/tenants");

  const systemRow = page.locator('[data-vt-row-key="t-system"]');
  await expect(systemRow.getByRole("button", { name: "View" })).toBeVisible();
  await systemRow.getByRole("button", { name: "View" }).click();
  await expect(page.getByRole("dialog", { name: "System Administration" })).toBeVisible();
  await page.keyboard.press("Escape");

  const tenantRow = page.locator('[data-vt-row-key="t-acme"]');
  await expect(tenantRow.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(tenantRow.getByRole("button", { name: "Renew" })).toBeVisible();
  await expect(tenantRow.getByRole("button", { name: "Disable" })).toBeVisible();
});

test("uses a switch for the two user availability states", async ({ page }) => {
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
  await mockIdentity(
    page,
    [principal.home_tenant],
    [administratorRole, operatorRole],
    [principal.user, memberUser],
  );
  await page.goto("/#/users");

  const memberRow = page.locator('[data-vt-row-key="u-member"]');
  await expect(memberRow.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  await expect(memberRow.getByRole("combobox")).toHaveCount(0);
  await expect(memberRow.getByRole("button", { name: "Reset password" })).toHaveText("");
  await expect(memberRow.getByRole("button", { name: "Delete" })).toHaveText("");
  await expect(memberRow.getByRole("button", { name: "More actions" })).toHaveCount(0);
  await memberRow.getByRole("switch").click();
  await expect(page.getByRole("dialog", { name: "Disable user" })).toBeVisible();
});

test("edits role permissions and assigns users from action modals", async ({ page }) => {
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
  await mockIdentity(
    page,
    [principal.home_tenant],
    [administratorRole, operatorRole],
    [principal.user, memberUser],
    menuItems,
    roleMenuItems,
  );
  await page.goto("/#/roles");

  await page.getByRole("button", { name: "New role" }).click();
  await expect(page.getByRole("dialog", { name: "New role" }).getByLabel("Role code")).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  const roleRow = page.locator('[data-vt-row-key="r-operator"]');
  const permissionButton = roleRow.getByRole("button", { name: "Edit permissions" });
  const assignButton = roleRow.getByRole("button", { name: "Assign users" });
  await expect(permissionButton).toHaveText("");
  await expect(assignButton).toHaveText("");
  await permissionButton.click();
  await expect(page.getByRole("dialog", { name: "Permissions for Operator" })).toBeVisible();
  const permissionDialog = page.getByRole("dialog");
  await expect(permissionDialog.getByRole("tree")).toBeVisible();
  await expect(permissionDialog.getByRole("treeitem", { name: /Users/ })).toBeVisible();
  await expect(permissionDialog.getByRole("checkbox", { name: "Update Users" })).toBeVisible();
  await page.keyboard.press("Escape");

  await roleRow.getByRole("button", { name: "Assign users" }).click();
  const dialog = page.getByRole("dialog", { name: "Assign users to Operator" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Member User", { exact: true })).toBeVisible();
});

test("manages dynamic menu visibility and ordering", async ({ page }) => {
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
  await page.goto("/#/menu-management");

  await expect(page.getByRole("heading", { name: "Menu Management", level: 2 })).toBeVisible();
  const systemGroupRow = page.locator('[data-vt-row-key="group.system"]');
  await systemGroupRow.getByRole("button", { name: "Collapse" }).click();
  await expect(page.locator('[data-vt-row-key="system.config"]')).toHaveCount(0);
  await systemGroupRow.getByRole("button", { name: "Expand", exact: true }).click();
  const menuRow = page.locator('[data-vt-row-key="system.config"]');
  await expect(menuRow.getByRole("switch")).toHaveCount(2);
  await menuRow.getByRole("button", { name: "Adjust order" }).click();
  await expect(page.getByRole("dialog", { name: "Adjust order" })).toBeVisible();
});

test("applies server menu visibility and enabled state to navigation and routes", async ({
  page,
}) => {
  const dynamicPrincipal = {
    ...principal,
    menus: menuItems.map((menu) =>
      menu.code === "system.config" ? { ...menu, enabled: false } : menu,
    ),
  };
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
  await page.route("**/v0/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ principal: dynamicPrincipal }),
    }),
  );
  await page.route("**/v0/management/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: menuItems }),
    }),
  );

  await page.goto("/#/menu-management");
  await expect(page.getByText("Menu Management", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Tenants", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Dashboard", { exact: true })).toHaveCount(0);
  await page.goto("/#/config");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("shows the built-in administrator role and super administrator account", async ({ page }) => {
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

  await page.goto("/#/users");
  const adminRow = page.locator('[data-vt-row-key="u-admin"]');
  await expect(adminRow).toBeVisible();
  await expect(adminRow.getByText("Super Administrator", { exact: true })).toBeVisible();
  await expect(adminRow.getByText("Administrator", { exact: true })).toBeVisible();

  await page.goto("/#/roles");
  await expect(page.getByRole("cell", { name: /Administrator/ }).first()).toBeVisible();
  await expect(page.getByText("platform_super_admin", { exact: true }).first()).toBeVisible();
});

test("creates a tenant without selecting it on the login page", async ({ page }) => {
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
  await expect(page.getByLabel("Slug", { exact: true })).toHaveCount(0);
  await page.getByLabel("Name", { exact: true }).fill("Tenant A");
  await page.getByLabel("Expires at", { exact: true }).fill("2030-01-01T00:00");
  await page.getByLabel("Admin username", { exact: true }).fill("tenant-admin");
  await page.getByLabel("Admin display name", { exact: true }).fill("Tenant Admin");
  await page.getByLabel("Admin password", { exact: true }).fill("tenant-password-123");
  await page.getByLabel("Description", { exact: true }).fill("Primary tenant");
  await page.getByRole("button", { name: "Create tenant" }).click();
  await expect.poll(() => createBody).not.toBeNull();
  expect(createBody).not.toHaveProperty("slug");
  expect(createBody).toMatchObject({
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
  await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();
  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator("header")).toHaveCount(0);
});

test("shows an expired tenant message when restoring a rejected session", async ({ page }) => {
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
  await expect(page.getByText("Read only provider", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ampcode" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /add new/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /import json/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /more actions/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /refresh usage/i })).toHaveCount(0);
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
    const path = new URL(route.request().url()).pathname.replace("/v0/management", "");
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
  await expect(page.getByRole("tab", { name: /excluded models/i })).toHaveCount(0);
  expect(excludedRequests).toBe(0);
});
