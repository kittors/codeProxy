import { act, renderHook, waitFor } from "@testing-library/react";
import { useState, type PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthFileItem } from "@/lib/http/types";
import {
  AUTH_FILES_DATA_CACHE_KEY,
  AUTH_FILES_UI_STATE_KEY,
  buildUsageIndex,
  pickQuotaPreviewItem,
  readAuthFilesDataCache,
  readAuthFilesUiState,
  resolveAuthFileRestrictionBadges,
  resolveAuthFileDisplayTags,
  resolveAuthFilePlanType,
  resolveAuthFileSupplementalTags,
  resolveAuthFileSubscriptionStatus,
  resolveAuthFileStats,
  sanitizeAuthFilesForCache,
  shouldShowAuthFileDisplayTag,
  writeAuthFilesDataCache,
  writeAuthFilesUiState,
} from "@/modules/auth-files/helpers/authFilesPageUtils";
import { useAuthFilesListState } from "@/modules/auth-files/hooks/useAuthFilesListState";
import { useAuthFilesDetailEditors } from "@/modules/auth-files/hooks/useAuthFilesDetailEditors";
import { useAuthFilesOAuthConfig } from "@/modules/auth-files/hooks/useAuthFilesOAuthConfig";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

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

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
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
  });

  test("round-trips ui state and sanitized session cache", () => {
    writeAuthFilesUiState({
      tab: "files",
      filter: "codex",
      search: "oauth",
      page: 3,
    });
    expect(window.sessionStorage.getItem(AUTH_FILES_UI_STATE_KEY)).toContain('"filter":"codex"');
    expect(readAuthFilesUiState()).toEqual({
      tab: "files",
      filter: "codex",
      search: "oauth",
      page: 3,
    });

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
    ]);

    writeAuthFilesDataCache({
      savedAtMs: 123,
      files: sanitized,
      quotaByFileName: {
        "codex.json": {
          status: "success",
          updatedAt: 456,
          planType: "pro",
          items: [{ label: "m_quota.code_5h", percent: 42, resetAtMs: 789 }],
        },
      },
    });
    expect(window.sessionStorage.getItem(AUTH_FILES_DATA_CACHE_KEY)).toContain('"savedAtMs":123');
    expect(readAuthFilesDataCache()).toEqual({
      savedAtMs: 123,
      files: sanitized,
      quotaByFileName: {
        "codex.json": {
          status: "success",
          updatedAt: 456,
          planType: "pro",
          items: [{ label: "m_quota.code_5h", percent: 42, resetAtMs: 789 }],
        },
      },
    });
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
          scope: "model",
          model: "gpt-5",
          http_status: 401,
          status_message: "unauthorized",
          next_retry_after: "2026-05-06T09:04:52.000Z",
        },
      ],
    } as AuthFileItem;

    expect(resolveAuthFileRestrictionBadges(file, nowMs)).toEqual([
      {
        key: "model:gpt-5:401:2026-05-06T09:04:52.000Z",
        label: "401 Error",
        model: "gpt-5",
        reason: "unauthorized",
        recoverAtMs: Date.parse("2026-05-06T09:04:52.000Z"),
        remainingText: "1h 4m 52s",
        tone: "danger",
      },
    ]);
  });

  test("keeps verbose transport errors out of restriction badge labels", () => {
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

    expect(resolveAuthFileRestrictionBadges(file, Date.now())[0]).toMatchObject({
      label: "Restricted",
      model: "gpt-5.4",
      reason: rawError,
    });
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

    const loadAll = vi.fn(async () => [] as AuthFileItem[]);
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
