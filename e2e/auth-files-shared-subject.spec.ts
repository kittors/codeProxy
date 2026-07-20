import { expect, test, type Page } from "@playwright/test";

const sharedSubjectID = "authsub_shared_codex";

const identitySummary = {
  provider: "codex",
  account_key: sharedSubjectID,
  auth_subject_id: sharedSubjectID,
  profile_key: "codex_desktop",
  profile_family: "desktop",
  enabled: true,
  primary_source: "learned",
  learned: true,
  learned_fields: 1,
  effective_fields: 1,
  source_counts: { learned: 1, preset: 0, builtin_default: 0 },
  client_product: "Codex Desktop",
  client_variant: "Desktop",
  version: "0.144.0",
  updated_at: "2026-07-20T08:00:00Z",
  last_seen_at: "2026-07-20T08:00:00Z",
};

const authFiles = [
  {
    id: "shared-auth-a",
    name: "shared-primary.json",
    label: "Shared Primary Alias",
    type: "codex",
    provider: "codex",
    account_type: "oauth",
    auth_index: "shared-alias-a",
    auth_subject_id: sharedSubjectID,
    disabled: false,
    size: 1024,
    modified: 1784534400000,
    identity_fingerprint_summary: identitySummary,
  },
  {
    id: "shared-auth-b",
    name: "shared-secondary.json",
    label: "Shared Secondary Alias",
    type: "codex",
    provider: "codex",
    account_type: "oauth",
    auth_index: "shared-alias-b",
    auth_subject_id: sharedSubjectID,
    disabled: false,
    size: 1024,
    modified: 1784534400000,
    identity_fingerprint_summary: identitySummary,
  },
];

const sharedStatus = {
  auth_index: "shared-alias-a",
  auth_subject_id: sharedSubjectID,
  provider: "codex",
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  subject_seed_kind: "account_id",
  current_tenant_binding_count: 2,
  refresh_state: "success",
  health_status: "ok",
  plan_type: "plus",
  subscription_started_at: "2026-07-01T00:00:00Z",
  subscription_expires_at: "2026-08-01T00:00:00Z",
  subscription_source: "signed_claims",
  quotas: [
    {
      quota_key: "code_week",
      quota_label: "Weekly",
      percent: 64,
      reset_at: "2026-07-27T00:00:00Z",
      window_seconds: 604800,
    },
  ],
  usage: {
    request_total: 1200,
    success_total: 1170,
    failure_total: 30,
    success_rate: 0.975,
    request_total_7d: 210,
    request_total_30d: 850,
    cycle_request_total: 140,
    cycle_cost_total: 3.5,
    cycle_known: true,
    cycle_start: "2026-07-14T00:00:00Z",
    projected_since: "2026-07-20T00:00:00Z",
    history_complete: false,
    updated_at: "2026-07-20T08:00:00Z",
  },
  version: 4,
  upstream_checked_at: "2026-07-20T08:00:00Z",
  updated_at: "2026-07-20T08:00:00Z",
};

const accountDetail = (revision: number, strategy: "active_profile" | "cli_preferred") => ({
  status_scope: "shared_subject",
  subject_scope: "shared",
  share_eligible: true,
  current_tenant_binding_count: 2,
  summary: identitySummary,
  effective: {
    provider: "codex",
    account_key: sharedSubjectID,
    auth_subject_id: sharedSubjectID,
    profile_key: "codex_desktop",
    profile_family: "desktop",
    enabled: true,
    client_product: "Codex Desktop",
    client_variant: "Desktop",
    version: "0.144.0",
    fields: {
      "user-agent": { value: "Codex Desktop/0.144.0", source: "learned" },
    },
  },
  learned: {
    provider: "codex",
    account_key: sharedSubjectID,
    auth_subject_id: sharedSubjectID,
    profile_key: "codex_desktop",
    profile_family: "desktop",
    client_product: "Codex Desktop",
    client_variant: "Desktop",
    version: "0.144.0",
    fields: { "user-agent": "Codex Desktop/0.144.0" },
    observed_headers: { "User-Agent": "Codex Desktop/0.144.0" },
  },
  profiles: [
    {
      selectable: true,
      summary: identitySummary,
      effective: {
        provider: "codex",
        account_key: sharedSubjectID,
        auth_subject_id: sharedSubjectID,
        profile_key: "codex_desktop",
        profile_family: "desktop",
        enabled: true,
        client_product: "Codex Desktop",
        client_variant: "Desktop",
        version: "0.144.0",
        fields: {
          "user-agent": { value: "Codex Desktop/0.144.0", source: "learned" },
        },
      },
    },
  ],
  policy: {
    provider: "codex",
    account_key: sharedSubjectID,
    strategy,
    active_profile_key: strategy === "active_profile" ? "codex_desktop" : "",
    revision,
  },
  selected_profile_key: "codex_desktop",
  selection_reason: strategy,
  preset: null,
  builtin_default: null,
});

const setAuthed = async (page: Page) => {
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
  });
};

const routeManagementMocks = async (page: Page) => {
  let policyRevision = 1;
  let policyStrategy: "active_profile" | "cli_preferred" = "active_profile";
  let policyUpdates = 0;

  await page.route("**/v0/management/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes("/ai-accounts/status-refresh/") && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "shared-refresh",
          state: "completed",
          total: 0,
          completed: 0,
          failed: 0,
          results: [],
        }),
      });
      return;
    }
    if (path.endsWith("/ai-accounts/status-refresh")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job_id: "shared-refresh",
          accepted: 0,
          deduplicated: 0,
        }),
      });
      return;
    }
    if (path.endsWith("/ai-accounts/status")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [sharedStatus] }),
      });
      return;
    }
    if (
      path.endsWith("/v0/management/identity-fingerprint/account/policy") &&
      request.method() === "PUT"
    ) {
      policyUpdates += 1;
      policyRevision += 1;
      policyStrategy = "cli_preferred";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(accountDetail(policyRevision, policyStrategy)),
      });
      return;
    }
    if (path.endsWith("/v0/management/identity-fingerprint/account")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(accountDetail(policyRevision, policyStrategy)),
      });
      return;
    }
    if (path.endsWith("/v0/management/auth-files")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files: authFiles }),
      });
      return;
    }
    if (path.endsWith("/v0/management/usage/auth-file-trend")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          auth_index: url.searchParams.get("auth_index"),
          days: 7,
          hours: 5,
          request_total: 1200,
          cycle_request_total: 140,
          cycle_known: true,
          cycle_cost_total: 3.5,
          daily_usage: [],
          hourly_usage: [],
          quota_series: [],
        }),
      });
      return;
    }
    if (path.endsWith("/v0/management/usage/entity-stats")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ source: [], auth_index: [] }),
      });
      return;
    }
    if (path.endsWith("/v0/management/config")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    if (path.endsWith("/v0/management/model-configs")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    if (path.endsWith("/v0/management/model-owner-presets")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    if (path.endsWith("/v0/management/auth-group-model-owner-mappings")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[]}',
      });
      return;
    }
    if (path.endsWith("/v0/management/proxy-pool")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"items":[]}',
      });
      return;
    }
    if (path.endsWith("/v0/management/update/check")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ update_available: false }),
      });
      return;
    }
    if (path.endsWith("/v0/management/auth-files/models")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"models":[]}',
      });
      return;
    }
    if (path.endsWith("/v0/management/auth-files/download")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  return { policyUpdates: () => policyUpdates };
};

test("AI Accounts shows an existing shared subject for two current-tenant aliases", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setAuthed(page);
  const state = await routeManagementMocks(page);

  await page.goto("/#/access/ai-accounts");

  const primaryCard = page.locator('[class*="group/card"]', {
    hasText: "Shared Primary Alias",
  });
  const secondaryCard = page.locator('[class*="group/card"]', {
    hasText: "Shared Secondary Alias",
  });
  await expect(primaryCard).toBeVisible();
  await expect(secondaryCard).toBeVisible();
  await expect(primaryCard.getByText("Shared account")).toBeVisible();
  await expect(primaryCard.getByText("Cycle 140")).toBeVisible();
  await expect(primaryCard.getByText("Lifetime 1200")).toBeVisible();
  await expect(primaryCard.getByText("Success 1170 / Failure 30")).toBeVisible();
  await expect(primaryCard.getByText("97.5%")).toBeVisible();

  await page.getByRole("tab", { name: "List" }).click();
  const primaryRow = page.locator("tr", { hasText: "Shared Primary Alias" });
  const secondaryRow = page.locator("tr", {
    hasText: "Shared Secondary Alias",
  });
  await expect(primaryRow).toContainText("Shared account");
  await expect(primaryRow).toContainText("140");
  await expect(primaryRow).toContainText("1200");
  await expect(secondaryRow).toContainText("Shared account");

  await primaryRow.getByRole("button", { name: "Details" }).click();
  await page.getByRole("tab", { name: "Identity" }).click();
  await expect(page.getByTestId("auth-file-identity-summary")).toContainText("Shared account");

  const dialogPromise = page.waitForEvent("dialog");
  await Promise.all([
    dialogPromise.then(async (dialog) => {
      expect(dialog.message()).toContain("same physical AI account");
      await dialog.accept();
    }),
    page.getByRole("button", { name: "Prefer CLI" }).click(),
  ]);
  await expect.poll(state.policyUpdates).toBe(1);
});
