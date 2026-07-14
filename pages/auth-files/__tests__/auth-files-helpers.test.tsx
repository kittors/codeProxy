import { act, renderHook, waitFor } from "@testing-library/react";
import { useState, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  AUTH_FILES_DATA_CACHE_KEY,
  AUTH_FILES_UI_STATE_KEY,
  buildUsageIndex,
  DEFAULT_CACHE_TENANT_ID,
  pickQuotaPreviewItem,
  readAuthFilesDataCache,
  readAuthFilesUiState,
  resolveAuthFileStatusBuckets,
  resolveClaudeOAuthHealth,
  resolveClaudeOAuthHealthBadges,
  resolveAuthFileDisplayName,
  resolveAuthFileRestrictionBadges,
  resolveAuthFileDisplayTags,
  resolveAuthFilePlanType,
  resolveAuthFileSupplementalTags,
  resolveAuthFileSubscriptionStatus,
  resolveFileType,
  resolveAuthFileStats,
  sanitizeAuthFilesForCache,
  setActiveCacheTenantId,
  setCacheTenantResolver,
  shouldShowAuthFileDisplayTag,
  shouldShowAuthFilePlanBadge,
  writeAuthFilesDataCache,
  writeAuthFilesUiState,
} from "@code-proxy/domain";
import { useAuthFilesListState } from "@pages/auth-files/hooks/useAuthFilesListState";
import { useAuthFilesDetailEditors } from "@pages/auth-files/hooks/useAuthFilesDetailEditors";
import { useAuthFilesOAuthConfig } from "@pages/auth-files/hooks/useAuthFilesOAuthConfig";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  getOauthExcludedModels: vi.fn(async () => ({})),
  getOauthModelAlias: vi.fn(async () => ({ codex: [{ name: "existing", alias: "existing" }] })),
  downloadText: vi.fn(async () => "{}"),
  upload: vi.fn(async (_file: File) => ({})),
  getModelDefinitions: vi.fn(async () => [
    { id: "existing", display_name: "Existing" },
    { id: "new-model", display_name: "New Model" },
  ]),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      getOauthExcludedModels: mocks.getOauthExcludedModels,
      getOauthModelAlias: mocks.getOauthModelAlias,
      downloadText: mocks.downloadText,
      upload: mocks.upload,
      getModelDefinitions: mocks.getModelDefinitions,
    },
  };
});

const wrapper = ({ children }: PropsWithChildren) => (
  <ThemeProvider>
    <ToastProvider>{children}</ToastProvider>
  </ThemeProvider>
);

describe("Auth Files helper coverage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    mocks.getOauthExcludedModels.mockReset();
    mocks.getOauthModelAlias.mockReset();
    mocks.downloadText.mockReset();
    mocks.upload.mockReset();
    mocks.getModelDefinitions.mockReset();
    mocks.getOauthExcludedModels.mockImplementation(async () => ({}));
    mocks.getOauthModelAlias.mockImplementation(async () => ({
      codex: [{ name: "existing", alias: "existing" }],
    }));
    mocks.downloadText.mockImplementation(async () => "{}");
    mocks.upload.mockImplementation(async () => ({}));
    mocks.getModelDefinitions.mockImplementation(async () => [
      { id: "existing", display_name: "Existing" },
      { id: "new-model", display_name: "New Model" },
    ]);
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
  });

  test("keeps auth-files UI state isolated per tenant and migrates legacy unscoped payload", () => {
    // Legacy unscoped v3 shape migrates into the default tenant only.
    window.localStorage.setItem(
      AUTH_FILES_UI_STATE_KEY,
      JSON.stringify({ tab: "files", filter: "xai", search: "old", page: 2 }),
    );
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    expect(readAuthFilesUiState()).toEqual({
      tab: "files",
      filter: "xai",
      search: "old",
      page: 2,
    });
    setActiveCacheTenantId("tenant-b");
    expect(readAuthFilesUiState()).toBeNull();

    writeAuthFilesUiState(
      { tab: "files", filter: "codex", search: "tenant-a", page: 1 },
      "tenant-a",
    );
    writeAuthFilesUiState(
      { tab: "files", filter: "qwen", search: "tenant-b", page: 4 },
      "tenant-b",
    );
    expect(readAuthFilesUiState("tenant-a")).toEqual({
      tab: "files",
      filter: "codex",
      search: "tenant-a",
      page: 1,
    });
    expect(readAuthFilesUiState("tenant-b")).toEqual({
      tab: "files",
      filter: "qwen",
      search: "tenant-b",
      page: 4,
    });
    // Writing for one tenant must not clobber the other bucket.
    writeAuthFilesUiState({ filter: "gemini", page: 1 }, "tenant-a");
    expect(readAuthFilesUiState("tenant-b")?.filter).toBe("qwen");
    expect(readAuthFilesUiState("tenant-a")?.filter).toBe("gemini");
  });

  test("round-trips ui state and sanitized session cache", () => {
    writeAuthFilesUiState({
      tab: "files",
      filter: "codex",
      search: "oauth",
      page: 3,
    });
    expect(window.localStorage.getItem(AUTH_FILES_UI_STATE_KEY)).toContain('"byTenant"');
    expect(window.localStorage.getItem(AUTH_FILES_UI_STATE_KEY)).toContain('"filter":"codex"');
    expect(readAuthFilesUiState()).toEqual({
      tab: "files",
      filter: "codex",
      search: "oauth",
      page: 3,
    });

    const rawClaudeOAuthHealth = {
      enabled: true,
      status: "refresh_pending",
      updated_at: "2026-06-23T08:00:00Z",
      refresh_available: true,
      last_runtime_status: 401,
      temporary_unschedulable_until: "2026-06-23T08:10:00Z",
      temporary_unschedulable_reason: "oauth_401",
      windows: {
        five_hour: {
          status: "rejected",
          reset_at: "2026-06-23T10:00:00Z",
          utilization: 1.02,
          exceeded: true,
          access_token: "should-not-persist",
        },
      },
      runtime_profile: {
        name: "claude_oauth_runtime",
        identity_fingerprint: "claude_headers",
        transport: "go_http_transport",
        egress: "proxy_pool",
      },
      refresh_token: "should-not-persist",
    };

    const files: AuthFileItem[] = [
      {
        id: "codex-main",
        name: "codex.json",
        type: "codex",
        provider: "codex",
        label: "Codex Main",
        email: "codex@example.com",
        account: "Codex Account",
        account_type: "oauth",
        auth_index: "auth-1",
        authIndex: "auth-1",
        disabled: false,
        status: undefined,
        status_message: undefined,
        unavailable: undefined,
        next_retry_after: undefined,
        restrictions: undefined,
        modified: 123456,
        size: 2048,
        runtimeOnly: true,
        planType: "pro",
        id_token: {
          chatgpt_account_id: "acct-1",
          plan_type: "pro",
        },
        access_token: "should-not-persist",
      } as AuthFileItem,
      {
        id: "claude-oauth-main",
        name: "claude-oauth-primary.json",
        type: "claude",
        provider: "claude",
        label: "Claude OAuth Primary",
        account_type: "oauth",
        auth_index: "claude-oauth-1",
        disabled: false,
        modified: 1782182400000,
        size: 1024,
        claude_oauth_health: rawClaudeOAuthHealth,
        access_token: "should-not-persist",
        refresh_token: "should-not-persist",
      },
    ];

    const sanitized = sanitizeAuthFilesForCache(files);
    expect(sanitized).toEqual([
      {
        id: "codex-main",
        name: "codex.json",
        type: "codex",
        provider: "codex",
        label: "Codex Main",
        email: "codex@example.com",
        account: "Codex Account",
        account_type: "oauth",
        auth_index: "auth-1",
        authIndex: "auth-1",
        disabled: false,
        modified: 123456,
        modtime: undefined,
        size: 2048,
        runtimeOnly: true,
        runtime_only: undefined,
        plan_type: undefined,
        planType: "pro",
        subscription_started_at: undefined,
        subscriptionStartedAt: undefined,
        subscription_start_at: undefined,
        subscriptionStartAt: undefined,
        subscription_started_at_ms: undefined,
        subscriptionStartedAtMs: undefined,
        subscription_period: undefined,
        subscriptionPeriod: undefined,
        subscription_expires_at: undefined,
        subscriptionExpiresAt: undefined,
        subscription_expires_at_ms: undefined,
        subscriptionExpiresAtMs: undefined,
        subscription_remaining_minutes: undefined,
        subscriptionRemainingMinutes: undefined,
        subscription_expired: undefined,
        subscriptionExpired: undefined,
        default_tags: [],
        custom_tags: [],
        hidden_default_tags: [],
        display_tags: undefined,
        id_token: {
          chatgpt_account_id: "acct-1",
          plan_type: "pro",
        },
      },
      {
        id: "claude-oauth-main",
        name: "claude-oauth-primary.json",
        type: "claude",
        provider: "claude",
        label: "Claude OAuth Primary",
        email: undefined,
        account: undefined,
        account_type: "oauth",
        auth_index: "claude-oauth-1",
        authIndex: undefined,
        disabled: false,
        status: undefined,
        status_message: undefined,
        unavailable: undefined,
        next_retry_after: undefined,
        restrictions: undefined,
        modified: 1782182400000,
        modtime: undefined,
        size: 1024,
        runtimeOnly: undefined,
        runtime_only: undefined,
        plan_type: undefined,
        planType: undefined,
        subscription_started_at: undefined,
        subscriptionStartedAt: undefined,
        subscription_start_at: undefined,
        subscriptionStartAt: undefined,
        subscription_started_at_ms: undefined,
        subscriptionStartedAtMs: undefined,
        subscription_period: undefined,
        subscriptionPeriod: undefined,
        subscription_expires_at: undefined,
        subscriptionExpiresAt: undefined,
        subscription_expires_at_ms: undefined,
        subscriptionExpiresAtMs: undefined,
        subscription_remaining_minutes: undefined,
        subscriptionRemainingMinutes: undefined,
        subscription_expired: undefined,
        subscriptionExpired: undefined,
        default_tags: [],
        custom_tags: [],
        hidden_default_tags: [],
        display_tags: undefined,
        claude_oauth_health: {
          enabled: true,
          status: "refresh_pending",
          updated_at: "2026-06-23T08:00:00Z",
          refresh_available: true,
          last_runtime_status: 401,
          temporary_unschedulable_until: "2026-06-23T08:10:00Z",
          temporary_unschedulable_reason: "oauth_401",
          windows: {
            five_hour: {
              status: "rejected",
              reset_at: "2026-06-23T10:00:00Z",
              utilization: 1.02,
              exceeded: true,
            },
          },
          runtime_profile: {
            name: "claude_oauth_runtime",
            identity_fingerprint: "claude_headers",
            transport: "go_http_transport",
            egress: "proxy_pool",
          },
        },
        id_token: undefined,
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("should-not-persist");

    writeAuthFilesDataCache({
      tenantId: "tenant-a",
      savedAtMs: 123,
      files: sanitized,
      quotaByFileName: {
        "codex.json": {
          status: "success",
          updatedAt: 456,
          planType: "pro",
          items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 42, resetAtMs: 789 }],
        },
      },
    });
    expect(window.localStorage.getItem(AUTH_FILES_DATA_CACHE_KEY)).toContain('"savedAtMs":123');
    expect(window.localStorage.getItem(AUTH_FILES_DATA_CACHE_KEY)).toContain("byTenant");
    expect(readAuthFilesDataCache("tenant-a")).toEqual({
      tenantId: "tenant-a",
      savedAtMs: 123,
      files: sanitized,
      quotaByFileName: {
        "codex.json": {
          status: "success",
          updatedAt: 456,
          planType: "pro",
          items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 42, resetAtMs: 789 }],
        },
      },
    });
    // Different tenant must not see tenant-a's list/quota payload.
    expect(readAuthFilesDataCache("tenant-b")).toBeNull();
  });

  test("keeps xAI identity fingerprint summary in sanitized cache", () => {
    const [file] = sanitizeAuthFilesForCache([
      {
        name: "xai.json",
        type: "xai",
        provider: "xai",
        auth_index: "xai-auth",
        identity_fingerprint_summary: {
          provider: "xai",
          account_key: "xai-account",
          enabled: true,
          primary_source: "learned",
          learned: true,
          learned_fields: 2,
          effective_fields: 2,
          source_counts: { learned: 2 },
          client_product: "grok-cli",
          version: "0.3.1",
        },
      } as AuthFileItem,
    ]);

    expect(file?.identity_fingerprint_summary).toMatchObject({
      provider: "xai",
      account_key: "xai-account",
      enabled: true,
      learned_fields: 2,
      effective_fields: 2,
      client_product: "grok-cli",
      version: "0.3.1",
    });
  });

  test("shows codex channel emails as the display name without requiring oauth account type", () => {
    const file = {
      name: "codex-alpha@example.test-plus.json",
      type: "codex",
      provider: "codex",
      email: "alpha@example.test",
      label: "",
    } satisfies AuthFileItem;

    expect(resolveAuthFileDisplayName(file)).toBe("alpha@example.test");
  });

  test("infers the codex provider from file names that include dotted emails", () => {
    const file = {
      name: "codex-pcamtu927@gmail.com-plus.json",
    } satisfies AuthFileItem;

    expect(resolveFileType(file)).toBe("codex");
    expect(resolveAuthFileDisplayName(file)).toBe("pcamtu927@gmail.com");
    expect(resolveAuthFilePlanType(file)).toBe("plus");
  });

  test("treats an explicit empty display tag list as hiding every tag", () => {
    const file = {
      name: "codex.json",
      default_tags: ["codex", "pro"],
      custom_tags: ["vip"],
      display_tags: [],
    } satisfies AuthFileItem;

    expect(resolveAuthFileDisplayTags(file)).toEqual([]);
    expect(
      resolveAuthFileDisplayTags({
        name: "codex.json",
        default_tags: ["codex", "pro"],
        custom_tags: ["vip"],
      }),
    ).toEqual(["codex", "pro", "vip"]);
  });

  test("checks default badge visibility from explicit display tags or hidden defaults", () => {
    expect(
      shouldShowAuthFileDisplayTag(
        {
          name: "codex.json",
          default_tags: ["codex", "pro"],
          hidden_default_tags: [],
          display_tags: ["codex"],
        } as AuthFileItem,
        "pro",
      ),
    ).toBe(false);
    expect(
      shouldShowAuthFileDisplayTag(
        {
          name: "codex.json",
          default_tags: ["codex", "pro"],
          hidden_default_tags: ["pro"],
        } as AuthFileItem,
        "pro",
      ),
    ).toBe(false);
    expect(
      shouldShowAuthFileDisplayTag(
        {
          name: "legacy.json",
        } as AuthFileItem,
        "codex",
      ),
    ).toBe(true);
  });

  test("always shows quota-derived plan badges even when display tags omit them", () => {
    // xAI SuperGrok is resolved from monthly credits, not auth-file default tags.
    expect(
      shouldShowAuthFilePlanBadge(
        {
          name: "xai.json",
          type: "xai",
          default_tags: ["xai"],
          display_tags: ["xai"],
        } as AuthFileItem,
        "supergrok",
      ),
    ).toBe(true);
    expect(
      shouldShowAuthFilePlanBadge(
        {
          name: "xai.json",
          type: "xai",
          default_tags: ["xai"],
          display_tags: [],
        } as AuthFileItem,
        "supergrok-heavy",
      ),
    ).toBe(true);
    // Codex plan tags still respect display_tags / hidden defaults.
    expect(
      shouldShowAuthFilePlanBadge(
        {
          name: "codex.json",
          default_tags: ["codex", "pro"],
          display_tags: ["codex"],
        } as AuthFileItem,
        "pro",
      ),
    ).toBe(false);
    expect(
      shouldShowAuthFilePlanBadge(
        {
          name: "codex.json",
          default_tags: ["codex", "pro"],
          display_tags: ["codex", "pro"],
        } as AuthFileItem,
        "pro",
      ),
    ).toBe(true);
    expect(shouldShowAuthFilePlanBadge({ name: "xai.json" } as AuthFileItem, null)).toBe(false);
  });

  test("drops stale display tags that no longer match current default or custom tags", () => {
    const file = {
      name: "codex.json",
      plan_type: "free",
      default_tags: ["codex", "free"],
      custom_tags: ["vip"],
      display_tags: ["codex", "plus", "vip"],
    } satisfies AuthFileItem;

    expect(resolveAuthFileDisplayTags(file)).toEqual(["codex", "vip"]);
    expect(resolveAuthFileSupplementalTags(file)).toEqual(["vip"]);
  });

  test("derives active restriction badges with exact remaining time", () => {
    const nowMs = Date.parse("2026-05-06T08:00:00.000Z");
    const file = {
      name: "codex.json",
      restrictions: [
        {
          scope: "auth",
          http_status: 401,
          status_message: "unauthorized",
          next_retry_after: "2026-05-06T09:04:52.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, nowMs)).toEqual([
      {
        key: "auth::401:2026-05-06T09:04:52.000Z",
        label: "401 Error",
        reason: "unauthorized",
        recoverAtMs: Date.parse("2026-05-06T09:04:52.000Z"),
        remainingText: "1h 4m 52s",
        tone: "danger",
      },
    ]);
  });

  test("ignores model-scoped transport errors as auth-file restriction badges", () => {
    const rawError =
      'Post "https://chatgpt.com/backend-api/codex/responses": read tcp [2607:8700:5500:8131::2]:44434->[2a06:98c1:310b::ac40:9bd1]:443: read: connection reset by peer';
    const file = {
      name: "codex.json",
      restrictions: [
        {
          scope: "model",
          model: "gpt-5.4",
          status: "error",
          status_message: rawError,
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, Date.now())).toEqual([]);
  });

  test("ignores model-scoped 429 usage errors as auth-file restriction badges", () => {
    const file = {
      name: "codex.json",
      restrictions: [
        {
          scope: "model",
          model: "gpt-5.5",
          http_status: 429,
          status_message: "usage limit exceeded",
          quota_exceeded: true,
          next_retry_after: "2026-05-06T13:00:00.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, Date.parse("2026-05-06T08:00:00.000Z"))).toEqual(
      [],
    );
  });

  
  test("shows a clear reason for 429 badges without status_message", () => {
    const file = {
      name: "xai.json",
      restrictions: [
        {
          scope: "auth",
          http_status: 429,
          quota_exceeded: true,
          reason: "quota",
          status: "error",
          unavailable: true,
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, Date.now())).toEqual([
      expect.objectContaining({
        label: "429 Error",
        reason: "rate limited (HTTP 429)",
        quotaLimited: true,
      }),
    ]);
  });

test("shows auth-level quota recovery records as 429 restriction badges", () => {
    const file = {
      name: "codex.json",
      restrictions: [
        {
          scope: "auth",
          http_status: 429,
          quota_exceeded: true,
          reason: "quota",
          quota_window: "5h",
          quota_window_minutes: 300,
          status: "error",
          status_message: '{"error":{"type":"usage_limit_reached","message":"usage limit"}}',
          unavailable: true,
          next_retry_after: "2026-05-06T13:00:00.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, Date.parse("2026-05-06T08:00:00.000Z"))).toEqual([
      expect.objectContaining({
        label: "429 Error",
        quotaWindow: "5h",
        quotaWindowMinutes: 300,
        reason: "usage limit",
        quotaLimited: true,
        recoverAtMs: Date.parse("2026-05-06T13:00:00.000Z"),
      }),
    ]);
  });

  test("keeps weekly auth-level quota windows distinct from five-hour windows", () => {
    const file = {
      name: "codex.json",
      restrictions: [
        {
          scope: "auth",
          http_status: 429,
          quota_exceeded: true,
          reason: "quota",
          quota_window: "week",
          quota_window_minutes: 10080,
          status_message: '{"error":{"type":"usage_limit_reached","message":"usage limit"}}',
          next_retry_after: "2026-05-13T08:00:00.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, Date.parse("2026-05-06T08:00:00.000Z"))).toEqual([
      expect.objectContaining({
        label: "429 Error",
        quotaWindow: "week",
        quotaWindowMinutes: 10080,
      }),
    ]);
  });

  test("xAI week restriction uses weekly_limit resetAtMs as recovery time", () => {
    const nowMs = Date.parse("2026-07-14T08:00:00.000Z");
    const weeklyResetAtMs = Date.parse("2026-07-16T07:38:00.000Z");
    const file = {
      name: "xai.json",
      restrictions: [
        {
          scope: "auth",
          http_status: 402,
          quota_exceeded: true,
          reason: "quota",
          quota_window: "week",
          quota_window_minutes: 10080,
          status_message: "Grok Build usage balance exhausted",
          // short local probe cooldown — not user-facing weekly recovery
          next_retry_after: "2026-07-14T08:01:00.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, nowMs, weeklyResetAtMs)).toEqual([
      expect.objectContaining({
        label: "402 Error",
        quotaWindow: "week",
        quotaLimited: true,
        recoverAtMs: weeklyResetAtMs,
      }),
    ]);
  });

  test("does not derive restriction badges from normal auth status", () => {
    expect(
      resolveAuthFileRestrictionBadges({
        name: "codex.json",
        status: "active",
        unavailable: false,
      } as AuthFileItem),
    ).toEqual([]);
  });

  test("derives Claude OAuth health badges from refresh pending and Anthropic windows", () => {
    const nowMs = Date.parse("2026-06-23T08:00:00.000Z");
    const file = {
      name: "claude-oauth-primary.json",
      type: "claude",
      provider: "claude",
      account_type: "oauth",
      claude_oauth_health: {
        enabled: true,
        status: "refresh_pending",
        refresh_available: true,
        last_runtime_status: 401,
        temporary_unschedulable_until: "2026-06-23T08:10:00.000Z",
        temporary_unschedulable_reason: "oauth_401",
        windows: {
          five_hour: {
            status: "rejected",
            reset_at: "2026-06-23T10:00:00.000Z",
            utilization: 1.02,
            exceeded: true,
          },
          seven_day: {
            status: "allowed",
            utilization: 0.32,
            exceeded: false,
          },
        },
      },
    } satisfies AuthFileItem;

    expect(resolveClaudeOAuthHealth(file)).toEqual(
      expect.objectContaining({
        status: "refresh_pending",
        refresh_available: true,
        last_runtime_status: 401,
      }),
    );
    expect(resolveClaudeOAuthHealthBadges(file, nowMs)).toEqual([
      expect.objectContaining({
        key: "refresh-pending",
        label: "OAuth refresh pending",
        resetAtMs: Date.parse("2026-06-23T08:10:00.000Z"),
      }),
      expect.objectContaining({
        key: "five-hour-limited",
        label: "5h limited",
        resetAtMs: Date.parse("2026-06-23T10:00:00.000Z"),
        utilization: 1.02,
      }),
    ]);
  });

  test("derives Claude OAuth health badges from seven-day Anthropic windows", () => {
    const nowMs = Date.parse("2026-06-23T08:00:00.000Z");
    const file = {
      name: "claude-oauth-primary.json",
      type: "claude",
      provider: "claude",
      account_type: "oauth",
      claude_oauth_health: {
        enabled: true,
        status: "exhausted",
        last_runtime_status: 429,
        temporary_unschedulable_until: "2026-06-26T08:00:00.000Z",
        temporary_unschedulable_reason: "anthropic_7d_window_exhausted",
        windows: {
          five_hour: {
            status: "allowed",
            utilization: 0.42,
            exceeded: false,
          },
          seven_day: {
            status: "allowed_warning",
            reset_at: "2026-06-26T08:00:00.000Z",
            utilization: 1.15,
            surpassed_threshold: true,
          },
        },
      },
    } satisfies AuthFileItem;

    expect(resolveClaudeOAuthHealthBadges(file, nowMs)).toEqual([
      expect.objectContaining({
        key: "seven-day-limited",
        label: "7d limited",
        resetAtMs: Date.parse("2026-06-26T08:00:00.000Z"),
        utilization: 1.15,
      }),
    ]);
    expect(Array.from(resolveAuthFileStatusBuckets(file))).toContain("http-429");
  });

  test("does not show an expired Claude OAuth refresh-pending badge", () => {
    const file = {
      name: "claude-oauth-primary.json",
      type: "claude",
      provider: "claude",
      account_type: "oauth",
      claude_oauth_health: {
        enabled: true,
        status: "refresh_pending",
        last_runtime_status: 401,
        temporary_unschedulable_until: "2026-06-23T08:10:00.000Z",
        temporary_unschedulable_reason: "oauth_401",
      },
    } satisfies AuthFileItem;

    expect(resolveClaudeOAuthHealthBadges(file, Date.parse("2026-06-23T08:11:00.000Z"))).toEqual(
      [],
    );
  });

  test("does not expose Claude OAuth health badges for ordinary Claude API key files", () => {
    const file = {
      name: "claude-api-key.json",
      type: "claude",
      provider: "claude",
      account_type: "api_key",
    } satisfies AuthFileItem;

    expect(resolveClaudeOAuthHealth(file)).toBeNull();
    expect(resolveClaudeOAuthHealthBadges(file)).toEqual([]);
  });

  test("ignores contaminated Claude OAuth health on explicit Claude API key files", () => {
    const file = {
      name: "claude-api-key.json",
      type: "claude",
      provider: "claude",
      account_type: "api_key",
      claude_oauth_health: {
        enabled: true,
        status: "refresh_pending",
        last_runtime_status: 401,
        temporary_unschedulable_until: "2026-06-23T08:10:00.000Z",
        windows: {
          seven_day: {
            status: "rejected",
            utilization: 1,
            exceeded: true,
          },
        },
      },
    } satisfies AuthFileItem;

    expect(resolveClaudeOAuthHealth(file)).toBeNull();
    expect(resolveClaudeOAuthHealthBadges(file, Date.parse("2026-06-23T08:00:00.000Z"))).toEqual(
      [],
    );
    expect(Array.from(resolveAuthFileStatusBuckets(file))).toEqual([]);
  });

  test("classifies Claude OAuth health into auth and 429 status buckets", () => {
    const file = {
      name: "claude-oauth-primary.json",
      type: "claude",
      provider: "claude",
      account_type: "oauth",
      claude_oauth_health: {
        enabled: true,
        status: "refresh_pending",
        last_runtime_status: 401,
        temporary_unschedulable_reason: "anthropic_5h_window_exhausted",
        windows: {
          five_hour: {
            status: "rejected",
            utilization: 1,
            exceeded: true,
          },
        },
      },
    } satisfies AuthFileItem;

    expect(Array.from(resolveAuthFileStatusBuckets(file)).sort()).toEqual([
      "http-429",
      "http-auth",
    ]);
  });

  test("prefers current auth-file plan metadata over cached quota plan", () => {
    expect(
      resolveAuthFilePlanType(
        {
          name: "codex.json",
          plan_type: "free",
        } as AuthFileItem,
        {
          status: "success",
          planType: "plus",
          items: [],
          updatedAt: Date.now(),
        },
      ),
    ).toBe("free");
    expect(
      resolveAuthFilePlanType(
        {
          name: "codex.json",
        } as AuthFileItem,
        {
          status: "success",
          planType: "plus",
          items: [],
          updatedAt: Date.now(),
        },
      ),
    ).toBe("plus");
  });

  test("aggregates auth file usage and picks quota preview entries", () => {
    const usage = buildUsageIndex({
      source: [{ entity_name: "codex-main.json", requests: 8, failed: 3 }],
      auth_index: [{ entity_name: "42", requests: 10, failed: 1 }],
    } as any);

    const authIndexedFile = {
      name: "codex-main.json",
      auth_index: "42",
    } as AuthFileItem;
    expect(resolveAuthFileStats(authIndexedFile, usage.index)).toEqual({ success: 9, failure: 1 });

    const sourceOnlyFile = {
      name: "codex-main.json",
    } as AuthFileItem;
    expect(resolveAuthFileStats(sourceOnlyFile, usage.index)).toEqual({ success: 5, failure: 3 });

    const quotaItems = [
      { label: "m_quota.code_weekly", percent: 80 } as any,
      { label: "m_quota.code_5h", percent: 50 } as any,
    ];
    expect(pickQuotaPreviewItem(quotaItems, "5h")?.label).toBe("m_quota.code_5h");
    expect(pickQuotaPreviewItem(quotaItems, "week")?.label).toBe("m_quota.code_weekly");
  });

  test("derives subscription expiration from start time and billing period", () => {
    const monthly = resolveAuthFileSubscriptionStatus(
      {
        name: "monthly.json",
        subscription_started_at: "2026-04-01T00:00:00.000Z",
        subscription_period: "monthly",
      } as AuthFileItem,
      Date.parse("2026-04-26T00:00:00.000Z"),
    );
    expect(monthly).toEqual(
      expect.objectContaining({
        expiresAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        remainingDays: 5,
        expired: false,
        tone: "urgent",
      }),
    );

    const yearly = resolveAuthFileSubscriptionStatus(
      {
        name: "yearly.json",
        subscription_started_at: "2025-05-01T00:00:00.000Z",
        subscription_period: "yearly",
      } as AuthFileItem,
      Date.parse("2026-04-26T00:00:00.000Z"),
    );
    expect(yearly).toEqual(
      expect.objectContaining({
        expiresAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        remainingDays: 5,
        expired: false,
        tone: "urgent",
      }),
    );
  });

  test("filters auth files, paginates, and prunes runtime-only selections", async () => {
    const files = [
      { name: "beta.json", type: "codex", provider: "codex" },
      { name: "alpha.json", type: "codex", provider: "codex" },
      { name: "runtime.json", type: "codex", provider: "codex", runtimeOnly: true },
      { name: "gemini.json", type: "gemini-cli", provider: "gemini-cli" },
    ] as AuthFileItem[];

    const { result } = renderHook(
      () => {
        const [page, setPage] = useState(9);
        const [selectedFileNames, setSelectedFileNames] = useState(["alpha.json", "runtime.json"]);
        return useAuthFilesListState({
          files,
          filter: "codex",
          tagFilter: "",
          statusFilter: "all",
          search: ".json",
          page,
          setPage,
          selectedFileNames,
          setSelectedFileNames,
        });
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.safePage).toBe(1);
      expect(result.current.filteredFiles.map((file) => file.name)).toEqual([
        "alpha.json",
        "beta.json",
        "runtime.json",
      ]);
      expect(Array.from(result.current.selectedFileNameSet)).toEqual(["alpha.json"]);
      expect(result.current.filterCounts.counts.codex).toBe(3);
      expect(result.current.selectableFilteredFiles.map((file) => file.name)).toEqual([
        "alpha.json",
        "beta.json",
      ]);
    });
  });

  test("transitions oauth alias import state and de-duplicates imported models", async () => {
    const { result } = renderHook(() => useAuthFilesOAuthConfig("alias"), { wrapper });

    await act(async () => {
      await result.current.refreshAlias();
    });

    expect(result.current.aliasEditing.codex).toEqual([
      { id: expect.any(String), name: "existing", alias: "existing" },
    ]);

    await act(async () => {
      await result.current.openImport("codex");
    });

    await waitFor(() => {
      expect(result.current.importOpen).toBe(true);
      expect(result.current.importLoading).toBe(false);
      expect(result.current.importModels.map((item) => item.id)).toEqual(["existing", "new-model"]);
    });

    await act(async () => {
      result.current.applyImport();
    });

    expect(result.current.importOpen).toBe(false);
    expect(result.current.aliasEditing.codex).toEqual([
      { id: expect.any(String), name: "existing", alias: "existing" },
      { id: expect.any(String), name: "new-model", alias: "new-model" },
    ]);
  });

  test("edits auth file proxy_id together with prefix and proxy_url", async () => {
    let uploadedText = "";
    mocks.downloadText.mockImplementation(async () =>
      JSON.stringify({
        prefix: "codex-main",
        proxy_url: "http://fallback.example:7890",
        proxy_id: "hk",
      }),
    );
    mocks.upload.mockImplementation(async (file: File) => {
      uploadedText = await file.text();
      return {};
    });

    const loadAll = vi.fn(async (): Promise<AuthFileItem[]> => []);
    const { result } = renderHook(() => useAuthFilesDetailEditors(loadAll), { wrapper });

    await act(async () => {
      result.current.setDetailFile({ name: "codex.json" } as AuthFileItem);
      result.current.setDetailOpen(true);
      result.current.setDetailTab("fields");
    });

    await waitFor(() => {
      expect(result.current.prefixProxyEditor.proxyId).toBe("hk");
    });

    await act(async () => {
      result.current.setPrefixProxyEditor((prev) => ({
        ...prev,
        proxyId: "jp",
      }));
    });

    expect(result.current.prefixProxyUpdatedText).toContain('"proxy_id": "jp"');

    await act(async () => {
      await result.current.savePrefixProxy();
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(uploadedText)).toEqual({
      prefix: "codex-main",
      proxy_url: "http://fallback.example:7890",
      proxy_id: "jp",
    });
    expect(loadAll).toHaveBeenCalledTimes(1);
  });
});
