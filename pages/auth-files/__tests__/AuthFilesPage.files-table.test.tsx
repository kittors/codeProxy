import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type {
  AuthFileItem,
  AuthFileTrendResponse,
  EntityStatsResponse,
} from "@code-proxy/api-client";
import {
  AUTH_FILES_DATA_CACHE_KEY,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
  writeAuthFilesDataCache,
  writeAuthFilesUiState,
} from "@code-proxy/domain";
import i18n from "@code-proxy/i18n";

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ files: AuthFileItem[] }>>(async () => ({
    files: [
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: Date.now(),
        disabled: false,
      },
    ],
  })),
  getEntityStats: vi.fn<() => Promise<EntityStatsResponse>>(async () => ({
    source: [],
    auth_index: [],
  })),
  getAuthFileTrend: vi.fn(
    async (authIndex: string): Promise<AuthFileTrendResponse> => ({
      auth_index: authIndex,
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_cost_total: 1.2345,
      cycle_total_tokens: 1234567,
      weekly_quota_used_percent: 8,
      cycle_known: true,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [{ date: "2026-04-30", requests: 2, cost: 0.0123 }],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.0045 }],
      quota_series: [],
    }),
  ),
  getUsageLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 200 })),
  getAuthFileGroupTrend: vi.fn(async () => ({
    days: 7,
    group: "all",
    points: [{ date: new Date().toISOString().slice(0, 10), requests: 9 }],
  })),
  recordAuthFileQuotaSnapshot: vi.fn(async () => ({})),
  fetchQuota: vi.fn((_provider?: unknown, _file?: { name?: string }) => new Promise(() => {})),
  getStatus: vi.fn(async () => ({ items: [] as Array<Record<string, unknown>> })),
  startStatusRefresh: vi.fn(async () => ({ job_id: "job-1", accepted: 0, deduplicated: 0 })),
  getStatusRefreshJob: vi.fn(async () => ({
    job_id: "job-1",
    state: "completed",
    total: 0,
    completed: 0,
    failed: 0,
    results: [] as Array<Record<string, unknown>>,
  })),
  consumeCodexResetCredit: vi.fn(async (_file?: { name?: string }) => undefined),
  deleteFile: vi.fn(async () => ({})),
  downloadText: vi.fn(async () => "{}"),
  patchFields: vi.fn(async () => ({})),
  getModelsForAuthFile: vi.fn(async () => ({
    models: [{ id: "live-only", owned_by: "runtime" }],
    source: "upstream",
  })),
  getModelConfigs: vi.fn(async () => [
    { id: "gpt-4.1", owned_by: "openai" },
    { id: "claude-sonnet-4-5", owned_by: "anthropic" },
  ]),
  getModelOwnerPresets: vi.fn(async () => [
    { value: "openai", label: "OpenAI", description: "OpenAI models", enabled: true },
    { value: "anthropic", label: "Anthropic", description: "Anthropic models", enabled: true },
  ]),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  saveAuthGroupModelOwnerMapping: vi.fn(async (_authGroup: string, _owner: string) => undefined),
  upload: vi.fn(async () => ({})),
  submitCallback: vi.fn(async () => ({})),
  getAuthStatus: vi.fn(async () => ({ status: "pending" })),
  startAuth: vi.fn(async () => ({ url: "https://example.test/oauth", state: "state-1" })),
  reconcile: vi.fn(async () => ({})),
  clearStatus: vi.fn(async () => ({})),
}));

let authGroupOwnerMappingMap: Record<string, string> = {};

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      deleteFile: mocks.deleteFile,
      downloadText: mocks.downloadText,
      patchFields: mocks.patchFields,
      getModelsForAuthFile: mocks.getModelsForAuthFile,
      upload: mocks.upload,
    },
    oauthApi: {
      ...mod.oauthApi,
      submitCallback: mocks.submitCallback,
      getAuthStatus: mocks.getAuthStatus,
      startAuth: mocks.startAuth,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
      saveAuthGroupModelOwnerMapping: mocks.saveAuthGroupModelOwnerMapping,
    },
    quotaApi: { ...mod.quotaApi, reconcile: mocks.reconcile, clearStatus: mocks.clearStatus },
    aiAccountsStatusApi: {
      getStatus: mocks.getStatus,
      startStatusRefresh: mocks.startStatusRefresh,
      getStatusRefreshJob: mocks.getStatusRefreshJob,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
      getAuthFileTrend: mocks.getAuthFileTrend,
      getUsageLogs: mocks.getUsageLogs,
      getAuthFileGroupTrend: mocks.getAuthFileGroupTrend,
      recordAuthFileQuotaSnapshot: mocks.recordAuthFileQuotaSnapshot,
    },
  };
});

vi.mock("@features/quota-preview/quota-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@features/quota-preview/quota-fetch")>();
  return {
    ...mod,
    fetchQuota: mocks.fetchQuota,
    consumeCodexResetCredit: mocks.consumeCodexResetCredit,
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

const padDatePart = (value: number): string => String(value).padStart(2, "0");

const toDateTimeLocalInput = (date: Date): string =>
  [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    "T",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");

const decodeBase64UrlJson = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const createAuthFileTrend = (authIndex: string, cycleRequestTotal: number) => ({
  auth_index: authIndex,
  days: 7,
  hours: 5,
  request_total: cycleRequestTotal,
  cycle_request_total: cycleRequestTotal,
  cycle_cost_total: 1.2345,
  cycle_total_tokens: 1234567,
  weekly_quota_used_percent: 8,
  cycle_known: true,
  cycle_start: "2026-04-27T16:01:21Z",
  daily_usage: [{ date: "2026-04-30", requests: cycleRequestTotal, cost: 0.0123 }],
  hourly_usage: [{ hour: "2026-04-30 16:00", requests: cycleRequestTotal, cost: 0.0045 }],
  quota_series: [],
});

const useTableFilesView = () => {
  window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
};

async function selectFileGroup(name: string | RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "File group" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("AuthFilesPage files table", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    window.sessionStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    mocks.list.mockReset();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "qwen.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getEntityStats.mockReset();
    mocks.getEntityStats.mockImplementation(async () => ({ source: [], auth_index: [] }));
    mocks.getAuthFileTrend.mockReset();
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) => ({
      auth_index: authIndex,
      days: 7,
      hours: 5,
      request_total: 3,
      cycle_request_total: 2,
      cycle_cost_total: 1.2345,
      cycle_total_tokens: 1234567,
      weekly_quota_used_percent: 8,
      cycle_known: true,
      cycle_start: "2026-04-27T16:01:21Z",
      daily_usage: [{ date: "2026-04-30", requests: 2, cost: 0.0123 }],
      hourly_usage: [{ hour: "2026-04-30 16:00", requests: 1, cost: 0.0045 }],
      quota_series: [],
    }));
    mocks.getUsageLogs.mockReset();
    mocks.getUsageLogs.mockImplementation(async () => ({
      items: [],
      total: 0,
      page: 1,
      size: 200,
    }));
    mocks.getAuthFileGroupTrend.mockReset();
    mocks.getAuthFileGroupTrend.mockImplementation(async () => ({
      days: 7,
      group: "all",
      points: [{ date: new Date().toISOString().slice(0, 10), requests: 9 }],
    }));
    mocks.recordAuthFileQuotaSnapshot.mockReset();
    mocks.recordAuthFileQuotaSnapshot.mockImplementation(async () => ({}));
    mocks.fetchQuota.mockReset();
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));
    // Bridge: status GET never calls fetchQuota (no fan-out). Refresh job does.
    const mapQuotaResult = (raw: unknown) => {
      const result = Array.isArray(raw) ? { items: raw } : (raw as Record<string, unknown> | null);
      const items = Array.isArray(result?.items) ? result.items : [];
      return {
        quotas: items.map(
          (item: {
            key?: string;
            label?: string;
            percent?: number | null;
            value?: string;
            meta?: string;
            resetAtMs?: number;
            windowSeconds?: number;
          }) => ({
            quota_key: item.key ?? item.label ?? "quota",
            quota_label: item.label,
            percent: item.percent ?? null,
            value: item.value,
            meta: item.meta,
            reset_at:
              typeof item.resetAtMs === "number"
                ? new Date(item.resetAtMs).toISOString()
                : undefined,
            window_seconds: item.windowSeconds,
          }),
        ),
        planType: (result as { planType?: string } | null)?.planType ?? null,
        resetCreditCount: (result as { resetCreditCount?: number } | null)?.resetCreditCount,
        resetCreditExpirations: (result as { resetCreditExpirations?: string[] } | null)
          ?.resetCreditExpirations,
      };
    };
    const buildUsageFromTrend = async (authIndex: string) => {
      try {
        const trend = await mocks.getAuthFileTrend(authIndex);
        return {
          cycle_request_total: trend.cycle_request_total,
          cycle_known: trend.cycle_known,
          request_total_30d: trend.request_total,
          success_total_30d: Math.max(0, trend.request_total ?? 0),
          failure_total_30d: 0,
          cycle_cost_total: trend.cycle_cost_total,
          cycle_total_tokens: trend.cycle_total_tokens,
          weekly_quota_used_percent: trend.weekly_quota_used_percent,
        };
      } catch {
        return undefined;
      }
    };
    const buildStatusItemFromFile = async (
      file: AuthFileItem,
      options?: { probeQuota?: boolean },
    ) => {
      const authIndex = String(file.auth_index ?? file.authIndex ?? file.name);
      const subject = String((file as { auth_subject_id?: string }).auth_subject_id ?? authIndex);
      let quotas: Array<Record<string, unknown>> = [];
      let planType: string | null = null;
      let resetCreditCount: number | undefined;
      let resetCreditExpirations: string[] | undefined;
      let errorMessage: string | undefined;
      if (options?.probeQuota) {
        try {
          const provider = String(file.type ?? file.provider ?? "codex").toLowerCase();
          const mapped = mapQuotaResult(await mocks.fetchQuota(provider, file));
          quotas = mapped.quotas;
          planType = mapped.planType;
          resetCreditCount = mapped.resetCreditCount;
          resetCreditExpirations = mapped.resetCreditExpirations;
        } catch (error: unknown) {
          errorMessage = error instanceof Error ? error.message : "quota_error";
        }
      }
      const usage = await buildUsageFromTrend(authIndex);
      return {
        auth_index: authIndex,
        auth_subject_id: subject,
        plan_type: planType,
        quotas,
        usage,
        reset_credit_count: resetCreditCount,
        reset_credit_expirations: resetCreditExpirations,
        error_message: errorMessage,
        health_status: errorMessage ? "error" : "ok",
        upstream_checked_at: new Date().toISOString(),
      };
    };
    mocks.getStatus.mockReset();
    mocks.getStatus.mockImplementation(async () => {
      const listed = await mocks.list();
      const filesList = Array.isArray(listed?.files) ? listed.files : [];
      const items = await Promise.all(
        filesList.map(async (file) => {
          // UI regression tests: probe quota via fetchQuota mock (not production path).
          // Request-shape O(1) guarantees live in AuthFilesPage.status-read-model.test.tsx.
          return buildStatusItemFromFile(file, { probeQuota: true });
        }),
      );
      return { items: items.filter(Boolean) };
    });
    let lastRefreshResults: Array<Record<string, unknown>> = [];
    mocks.startStatusRefresh.mockReset();
    mocks.startStatusRefresh.mockImplementation(async (payload?: { auth_indexes?: string[] }) => {
      const indexes = payload?.auth_indexes ?? [];
      const listed = await mocks.list();
      const filesList = Array.isArray(listed?.files) ? listed.files : [];
      lastRefreshResults = await Promise.all(
        indexes.map(async (authIndex) => {
          const file =
            filesList.find(
              (item) => String(item.auth_index ?? item.authIndex ?? "") === authIndex,
            ) ?? ({ name: authIndex, auth_index: authIndex, type: "codex" } as AuthFileItem);
          const result = await buildStatusItemFromFile(file, { probeQuota: true });
          return {
            auth_index: authIndex,
            auth_subject_id: result.auth_subject_id,
            state: result.error_message ? "error" : "success",
            error_message: result.error_message,
            result: result.error_message ? null : result,
          };
        }),
      );
      return {
        job_id: "job-1",
        accepted: indexes.length,
        deduplicated: 0,
      };
    });
    mocks.getStatusRefreshJob.mockReset();
    mocks.getStatusRefreshJob.mockImplementation(async () => ({
      job_id: "job-1",
      state: "completed",
      total: lastRefreshResults.length,
      completed: lastRefreshResults.length,
      failed: 0,
      results: lastRefreshResults,
    }));
    mocks.consumeCodexResetCredit.mockReset();
    mocks.consumeCodexResetCredit.mockResolvedValue(undefined);
    mocks.deleteFile.mockReset();
    mocks.deleteFile.mockImplementation(async () => ({}));
    mocks.downloadText.mockReset();
    mocks.downloadText.mockImplementation(async () => "{}");
    mocks.patchFields.mockReset();
    mocks.patchFields.mockImplementation(async () => ({}));
    mocks.getModelsForAuthFile.mockReset();
    mocks.getModelsForAuthFile.mockImplementation(async () => ({
      models: [{ id: "live-only", owned_by: "runtime" }],
      source: "upstream",
    }));
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockImplementation(async () => [
      { id: "gpt-4.1", owned_by: "openai" },
      { id: "claude-sonnet-4-5", owned_by: "anthropic" },
    ]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockImplementation(async () => [
      { value: "openai", label: "OpenAI", description: "OpenAI models", enabled: true },
      { value: "anthropic", label: "Anthropic", description: "Anthropic models", enabled: true },
    ]);
    authGroupOwnerMappingMap = {};
    mocks.getAuthGroupModelOwnerMappingMap.mockReset();
    mocks.getAuthGroupModelOwnerMappingMap.mockImplementation(async () => ({
      ...authGroupOwnerMappingMap,
    }));
    mocks.saveAuthGroupModelOwnerMapping.mockReset();
    mocks.saveAuthGroupModelOwnerMapping.mockImplementation(
      async (authGroup: string, owner: string) => {
        if (owner) authGroupOwnerMappingMap[authGroup] = owner;
        else delete authGroupOwnerMappingMap[authGroup];
      },
    );
    mocks.upload.mockReset();
    mocks.upload.mockImplementation(async () => ({}));
    mocks.submitCallback.mockReset();
    mocks.submitCallback.mockImplementation(async () => ({}));
    mocks.getAuthStatus.mockReset();
    mocks.getAuthStatus.mockImplementation(async () => ({ status: "pending" }));
    mocks.startAuth.mockReset();
    mocks.startAuth.mockImplementation(async () => ({
      url: "https://example.test/oauth",
      state: "state-1",
    }));
    mocks.reconcile.mockReset();
    mocks.reconcile.mockImplementation(async () => ({}));
    mocks.clearStatus.mockReset();
    mocks.clearStatus.mockImplementation(async () => ({}));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("defaults to card view for auth files and keeps actions available", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add OAuth Login" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selection actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select current page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete All" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Enable/Disable" })).toBeInTheDocument();
  });

  test("collapses filters behind a single mobile filter control", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();

    const mobileToggle = screen.getByTestId("auth-files-mobile-filter-toggle");
    const mobilePanel = screen.getByTestId("auth-files-mobile-filter-panel");
    expect(mobileToggle).toHaveAttribute("aria-expanded", "false");
    expect(mobilePanel).toHaveClass("hidden");

    await user.click(mobileToggle);

    expect(mobileToggle).toHaveAttribute("aria-expanded", "true");
    expect(mobilePanel).not.toHaveClass("hidden");
  });

  test("filters auth file cards by status buckets", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-limited.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "auth",
              http_status: 429,
              quota_exceeded: true,
              status: "error",
              status_message: "usage limit",
            },
          ],
        },
        {
          name: "codex-other-error.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          status: "error",
          status_message: "bad token",
          unavailable: true,
        },
        {
          name: "codex-disabled.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: true,
        },
        {
          name: "qwen-ok.json",
          type: "qwen",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-limited.json")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    expect(screen.getByRole("option", { name: /429/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Other errors/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Disabled/ })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /429/ }));

    expect(screen.getByText("codex-limited.json")).toBeInTheDocument();
    expect(screen.queryByText("codex-other-error.json")).not.toBeInTheDocument();
    expect(screen.queryByText("codex-disabled.json")).not.toBeInTheDocument();
    expect(screen.queryByText("qwen-ok.json")).not.toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(screen.getByRole("option", { name: /Other errors/ }));

    expect(screen.queryByText("codex-limited.json")).not.toBeInTheDocument();
    expect(screen.getByText("codex-other-error.json")).toBeInTheDocument();
    expect(screen.queryByText("codex-disabled.json")).not.toBeInTheDocument();
    expect(screen.queryByText("qwen-ok.json")).not.toBeInTheDocument();
  });

  test("keeps bulk selection collapsed until files are selected", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selection actions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select current page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Selection actions" }));

    expect(screen.getByRole("menuitem", { name: "Select current page" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Select filtered results" })).toBeInTheDocument();
  });

  test("uploads multiple auth files from pasted JSON objects", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          JSON.stringify({ type: "codex", account_id: "acct-one", access_token: "token-one" }),
          JSON.stringify({ type: "kimi", account_id: "acct-two", refresh_token: "token-two" }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File], [File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual([
      "codex-acct-one.json",
      "kimi-acct-two.json",
    ]);
    const uploadedJson = await Promise.all(
      uploadCalls.map(async ([file]) => JSON.parse(await file.text()) as Record<string, unknown>),
    );
    expect(uploadedJson).toEqual([
      { type: "codex", account_id: "acct-one", access_token: "token-one" },
      { type: "kimi", account_id: "acct-two", refresh_token: "token-two" },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
  });

  test("shows upload progress while pasted auth files are uploading", async () => {
    const firstUpload = createDeferred<{}>();
    const secondUpload = createDeferred<{}>();
    mocks.upload
      .mockImplementationOnce(() => firstUpload.promise)
      .mockImplementationOnce(() => secondUpload.promise);

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          JSON.stringify({ type: "codex", account_id: "acct-one", access_token: "token-one" }),
          JSON.stringify({ type: "kimi", account_id: "acct-two", refresh_token: "token-two" }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByTestId("auth-files-upload-progress-title")).toHaveTextContent(
        "Uploading 0 / 2",
      ),
    );
    expect(screen.queryByTestId("auth-files-json-upload-progress")).not.toBeInTheDocument();

    await act(async () => {
      firstUpload.resolve({});
      await firstUpload.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("auth-files-upload-progress-title")).toHaveTextContent(
        "Uploading 1 / 2",
      ),
    );

    await act(async () => {
      secondUpload.resolve({});
      await secondUpload.promise;
    });

    await waitFor(() =>
      expect(screen.queryByTestId("auth-files-upload-progress")).not.toBeInTheDocument(),
    );
  });

  test("expands pasted codex export bundles into synthesized auth files", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          "=== 卡密内容 ===",
          JSON.stringify({
            exported_at: "2026-05-22T19:59:51.483Z",
            proxies: [],
            accounts: [
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-one",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T19:59:51.483Z",
                },
              },
            ],
          }),
          JSON.stringify({
            exported_at: "2026-05-22T20:02:43.650Z",
            proxies: [],
            accounts: [
              {
                name: "beta@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-two",
                  chatgpt_account_id: "acct-222",
                  chatgpt_user_id: "user-222",
                  email: "beta@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "beta@example.test",
                  last_refresh: "2026-05-22T20:02:43.650Z",
                },
              },
            ],
          }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(2));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File], [File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual([
      "codex-alpha@example.test-plus.json",
      "codex-beta@example.test-plus.json",
    ]);

    const uploadedJson = await Promise.all(
      uploadCalls.map(async ([file]) => JSON.parse(await file.text()) as Record<string, unknown>),
    );
    const firstLastRefresh = String(uploadedJson[0]?.last_refresh ?? "");
    const secondLastRefresh = String(uploadedJson[1]?.last_refresh ?? "");
    expect(firstLastRefresh).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
    expect(secondLastRefresh).toBe(firstLastRefresh);

    expect(uploadedJson).toEqual([
      expect.objectContaining({
        type: "codex",
        account_id: "acct-111",
        chatgpt_account_id: "acct-111",
        email: "alpha@example.test",
        name: "alpha@example.test",
        plan_type: "plus",
        chatgpt_plan_type: "plus",
        id_token_synthetic: true,
        access_token: "access-token-one",
        refresh_token: "",
        last_refresh: firstLastRefresh,
        expired: "2026-06-01T17:08:08.000Z",
      }),
      expect.objectContaining({
        type: "codex",
        account_id: "acct-222",
        chatgpt_account_id: "acct-222",
        email: "beta@example.test",
        name: "beta@example.test",
        plan_type: "plus",
        chatgpt_plan_type: "plus",
        id_token_synthetic: true,
        access_token: "access-token-two",
        refresh_token: "",
        last_refresh: firstLastRefresh,
        expired: "2026-06-01T17:08:08.000Z",
      }),
    ]);

    const firstToken = String(uploadedJson[0]?.id_token ?? "");
    const [firstHeaderPart, firstPayloadPart, firstSignaturePart] = firstToken.split(".");
    expect(firstSignaturePart).toBe("synthetic");
    expect(decodeBase64UrlJson(firstHeaderPart)).toMatchObject({
      alg: "none",
      typ: "JWT",
      cpa_synthetic: true,
    });
    expect(decodeBase64UrlJson(firstPayloadPart)).toMatchObject({
      iat: Math.floor(Date.parse(firstLastRefresh) / 1000),
      exp: Math.floor(Date.parse("2026-06-01T17:08:08.000Z") / 1000),
      email: "alpha@example.test",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-111",
        chatgpt_plan_type: "plus",
        chatgpt_user_id: "user-111",
        user_id: "user-111",
      },
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Paste Auth JSON" })).not.toBeInTheDocument(),
    );
  });

  test("skips duplicate codex accounts that are already in the list or repeated in the pasted bundle", async () => {
    const existingAlpha = {
      name: "codex-alpha@example.test-plus.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      email: "alpha@example.test",
      label: "alpha@example.test",
      account_id: "acct-111",
      chatgpt_account_id: "acct-111",
      auth_index: "auth-alpha",
      size: 1024,
      modified: Date.now(),
      disabled: false,
    };
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "qwen.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
        existingAlpha,
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: [
          "=== 卡密内容 ===",
          JSON.stringify({
            exported_at: "2026-05-22T20:11:27.181Z",
            proxies: [],
            accounts: [
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-one",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
              {
                name: "beta@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-two",
                  chatgpt_account_id: "acct-222",
                  chatgpt_user_id: "user-222",
                  email: "beta@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "beta@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
              {
                name: "alpha@example.test",
                platform: "openai",
                type: "oauth",
                credentials: {
                  access_token: "access-token-three",
                  chatgpt_account_id: "acct-111",
                  chatgpt_user_id: "user-111",
                  email: "alpha@example.test",
                  expires_at: "2026-06-01T17:08:08.000Z",
                  plan_type: "plus",
                },
                extra: {
                  email: "alpha@example.test",
                  last_refresh: "2026-05-22T20:11:27.181Z",
                },
              },
            ],
          }),
        ].join("\n"),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    expect(uploadCalls.map(([file]) => file.name)).toEqual(["codex-beta@example.test-plus.json"]);
  });

  test("refreshes pasted auth files and quotas from the latest uploaded list", async () => {
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    const now = Date.now();
    const initialFile = {
      name: "qwen.json",
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
    };
    const uploadedFile = {
      name: "auth-server-renamed.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex",
      chatgpt_account_id: "acct-123",
      size: 2048,
      modified: now + 1,
      disabled: false,
    };
    mocks.list
      .mockImplementationOnce(async () => ({ files: [initialFile] }))
      .mockImplementation(async () => ({ files: [initialFile, uploadedFile] }));
    mocks.upload.mockResolvedValue({});
    mocks.fetchQuota.mockImplementation(async () => ({
      items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 11 }],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: {
        value: JSON.stringify({
          type: "codex",
          account_id: "acct-123",
          access_token: "token",
        }),
      },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalled());
    expect(await screen.findByText("auth-server-renamed.json")).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalled();
      const payload = (
        mocks.startStatusRefresh.mock.calls as unknown as Array<[{ auth_indexes?: string[] }]>
      ).at(-1)?.[0];
      expect(payload?.auth_indexes).toContain("auth-codex");
    });
  });

  test("shows an error for invalid pasted auth JSON", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paste JSON" }));

    const dialog = await screen.findByRole("dialog", { name: "Paste Auth JSON" });
    fireEvent.change(within(dialog).getByLabelText("Auth file JSON"), {
      target: { value: '{"type":"codex"' },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload JSON" }));

    expect(
      await within(dialog).findByText(
        "Please paste valid JSON objects or a JSON array of objects.",
      ),
    ).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  test("keeps three table actions inline and collapses the tail into a fixed-width menu", async () => {
    useTableFilesView();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          type: "codex",
          account_type: "oauth",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const row = await screen.findByRole("row", { name: /codex-pro\.json/ });
    const actionGroup = within(row).getByRole("button", { name: "Refresh" }).closest("div");
    const actionHeader = screen.getByRole("columnheader", { name: "Action" });
    const actionCell = row.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');

    expect(actionGroup).not.toBeNull();
    expect(actionGroup).toHaveClass("flex");
    expect(actionGroup).toHaveClass("flex-nowrap");
    expect(actionGroup).toHaveClass("whitespace-nowrap");
    expect(actionGroup).not.toHaveClass("flex-wrap");
    expect(actionHeader).toHaveClass("w-40");
    expect(actionCell).not.toBeNull();
    expect(within(actionCell as HTMLElement).getAllByRole("button")).toHaveLength(4);
    expect(
      within(actionCell as HTMLElement).getByRole("button", { name: "More actions" }),
    ).toBeInTheDocument();
  });

  test("loads initial usage stats only for listed auth files", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "codex-pro.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          auth_index: "auth-codex",
        },
        {
          name: "kimi-a.json",
          type: "kimi",
          size: 1024,
          modified: now,
          disabled: false,
          auth_index: "auth-kimi",
        },
      ],
    }));
    mocks.getStatus.mockResolvedValue({
      items: [
        {
          auth_index: "auth-codex",
          quotas: [],
          usage: { request_total_30d: 1, success_total_30d: 1, failure_total_30d: 0 },
        },
        {
          auth_index: "auth-kimi",
          quotas: [],
          usage: { request_total_30d: 2, success_total_30d: 2, failure_total_30d: 0 },
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-pro.json")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.getStatus).toHaveBeenCalled();
    });
    // Enter path may quiet-probe visible cards (fetchQuota only via test bridge); never entity-stats.
    expect(mocks.getEntityStats).not.toHaveBeenCalled();
  });

  test("shows active auth-level restriction badge with reason and recovery tooltip", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "codex.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "auth",
              http_status: 401,
              status_message: "unauthorized",
              next_retry_after: new Date(now + 34 * 60_000 + 50_000).toISOString(),
            },
          ],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const badge = await screen.findByText("401 Error");
    const tooltipTrigger = badge.closest("[aria-describedby]") ?? badge;
    fireEvent.mouseEnter(tooltipTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("unauthorized");
    expect(tooltip).toHaveTextContent("Auto recovery in");
  });

  test("hides model-scoped transport errors from table restriction badges", async () => {
    useTableFilesView();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(640);

    const now = Date.now();
    const rawError =
      'Post "https://chatgpt.com/backend-api/codex/responses": read tcp [2607:8700:5500:8131::2]:44434->[2a06:98c1:310b::ac40:9bd1]:443: read: connection reset by peer';
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "free",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "model",
              model: "gpt-5.4",
              status: "error",
              status_message: rawError,
            },
          ],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const row = title.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("500 Error")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("429 Error")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText(rawError)).not.toBeInTheDocument();
  });

  test("cards view hides model-scoped transient errors from badge rows", async () => {
    const now = Date.now();
    const rawError = "context canceled";
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "free",
          size: 1024,
          modified: now,
          disabled: false,
          restrictions: [
            {
              scope: "model",
              model: "gpt-5.4",
              status: "error",
              status_message: rawError,
            },
          ],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("500 Error")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("429 Error")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(rawError)).not.toBeInTheDocument();
  });

  test("cards view shows auth-level quota recovery records with a clean 429 tooltip", async () => {
    const now = Date.now();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-plus.json",
          label: "Codex Plus",
          account_type: "oauth",
          type: "codex",
          plan_type: "plus",
          size: 1024,
          modified: now,
          disabled: false,
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
              next_retry_after: new Date(now + 5 * 60 * 60 * 1000).toISOString(),
            },
          ],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("Codex Plus");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText("Restricted")).not.toBeInTheDocument();
    const errorBadges = within(card as HTMLElement).getByTestId("auth-file-card-error-badges");
    const quota = within(card as HTMLElement).getByTestId("auth-file-card-quota");
    expect(
      Boolean(errorBadges.compareDocumentPosition(quota) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(within(quota).getByTestId("auth-file-card-quota-empty")).toHaveTextContent(
      "Quota unavailable",
    );
    const badge = within(errorBadges).getByText("429 Error");
    const tooltipTrigger = badge.closest("[aria-describedby]") ?? badge;
    fireEvent.mouseEnter(tooltipTrigger);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Requests are limited");
    expect(tooltip).toHaveTextContent("Limit window: 5h");
    expect(tooltip).toHaveTextContent("Reason: usage limit");
    expect(tooltip).toHaveTextContent("Refresh time:");
    expect(tooltip).toHaveTextContent("Auto recovery in");
    expect(tooltip).not.toHaveTextContent("usage_limit_reached");
    // Multi-line tooltip: each fact on its own line for scanability.
    expect(tooltip.textContent?.includes("\n")).toBe(true);
  });

  test("supports multi-select delete from the toolbar", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select qwen.json"));
    expect(screen.getByRole("button", { name: "Disable" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mocks.deleteFile).toHaveBeenCalledWith("qwen.json");
      expect(screen.queryByText("qwen.json")).not.toBeInTheDocument();
    });
  });

  test("resets the file group when deleting the last file for the selected provider", async () => {
    const now = Date.now();
    const xaiFile: AuthFileItem = {
      name: "xai-user.json",
      type: "xai",
      provider: "xai",
      account_type: "oauth",
      email: "user@example.com",
      auth_index: "xai-auth",
      size: 2048,
      modified: now,
      disabled: false,
    };

    writeAuthFilesUiState({ tab: "files", filter: "xai", search: "", page: 1 });
    mocks.list.mockImplementation(async () => ({ files: [xaiFile] }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "File group" })).toHaveTextContent(/xai1/);

    fireEvent.click(screen.getByLabelText("Select user@example.com"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mocks.deleteFile).toHaveBeenCalledWith("xai-user.json");
      expect(screen.queryByText("user@example.com")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "File group" })).toHaveTextContent(/All0/);
    });
  });

  test("cards view shows xAI billing quota instead of local usage", async () => {
    const now = Date.now();
    const xaiFile: AuthFileItem = {
      name: "xai-user.json",
      type: "xai",
      provider: "xai",
      account_type: "oauth",
      email: "user@example.com",
      auth_index: "xai-auth",
      size: 2048,
      modified: now,
      disabled: false,
    };

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({ files: [xaiFile] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        {
          key: "weekly_limit",
          label: "xai_quota.weekly_limit",
          percent: 75,
          value: "75%",
          resetAtMs: now + 7 * 24 * 60 * 60 * 1000,
          windowSeconds: 604800,
        },
        {
          key: "product:Grok 4",
          label: "xai_quota.product_usage_named::Grok 4",
          percent: 60,
          value: "60%",
        },
        {
          key: "pay_as_you_go",
          label: "xai_quota.pay_as_you_go_label",
          percent: 80,
          value: "80%",
          meta: "$40.00 / $50.00",
        },
        {
          key: "monthly_credits",
          label: "xai_quota.monthly_credits",
          percent: 87,
          value: "87%",
          resetAtMs: now + 23 * 24 * 60 * 60 * 1000,
          meta: "$130.00 / $150.00",
        },
      ],
      planType: "supergrok",
    });
    mocks.getEntityStats.mockImplementation(async () => ({
      source: [],
      auth_index: [
        {
          entity_name: "xai-auth",
          requests: 20,
          failed: 2,
          avg_latency: 120,
          total_tokens: 4000,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("user@example.com");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    const quota = within(card as HTMLElement).getByTestId("auth-file-card-quota");

    await waitFor(() => {
      expect(mocks.fetchQuota).toHaveBeenCalledWith(
        "xai",
        expect.objectContaining({ name: "xai-user.json" }),
      );
      expect(quota).toHaveTextContent("Weekly limit");
      expect(quota).toHaveTextContent("75%");
      expect(quota).toHaveTextContent("Grok 4 usage");
      expect(quota).toHaveTextContent("60%");
      expect(quota).toHaveTextContent("Pay as you go");
      expect(quota).toHaveTextContent("$40.00 / $50.00");
      expect(quota).toHaveTextContent("Monthly credits");
      expect(quota).toHaveTextContent("$130.00 / $150.00");
      expect(card as HTMLElement).toHaveTextContent("SUPERGROK");
    });
    expect(quota).not.toHaveTextContent("Used");
    expect(quota).not.toHaveTextContent("Requests");
    expect(quota).not.toHaveTextContent("Failure");
  });

  test("shows a skeleton table while first loading", async () => {
    mocks.list.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-table-skeleton")).toBeInTheDocument();
  });

  test("paints tenant-cached auth files immediately without skeleton (warm remount SWR)", async () => {
    const now = Date.now();
    setActiveCacheTenantId("tenant-warm");
    writeAuthFilesDataCache({
      tenantId: "tenant-warm",
      savedAtMs: now,
      files: [
        {
          name: "cached-codex.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        } as AuthFileItem,
      ],
    });

    let resolveList: (value: { files: AuthFileItem[] }) => void = () => {};
    mocks.list.mockImplementationOnce(
      () =>
        new Promise<{ files: AuthFileItem[] }>((resolve) => {
          resolveList = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText("cached-codex.json")).toBeInTheDocument();
    expect(screen.queryByTestId("auth-files-table-skeleton")).not.toBeInTheDocument();

    resolveList({
      files: [
        {
          name: "fresh-codex.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        } as AuthFileItem,
      ],
    });
    expect(await screen.findByText("fresh-codex.json")).toBeInTheDocument();
    expect(screen.queryByText("cached-codex.json")).not.toBeInTheDocument();
  });

  test("keeps empty-list warm remount free of skeleton", async () => {
    setActiveCacheTenantId("tenant-empty");
    writeAuthFilesDataCache({
      tenantId: "tenant-empty",
      savedAtMs: Date.now(),
      files: [],
    });

    mocks.list.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("auth-files-table-skeleton")).not.toBeInTheDocument();
    expect(await screen.findByText(/No auth files|No files/i)).toBeInTheDocument();
  });

  test("does not paint another tenant's cached auth files on remount", async () => {
    const now = Date.now();
    setActiveCacheTenantId("tenant-a");
    writeAuthFilesDataCache({
      tenantId: "tenant-a",
      savedAtMs: now,
      files: [
        {
          name: "tenant-a.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        } as AuthFileItem,
      ],
    });
    setActiveCacheTenantId("tenant-b");

    let resolveList: (value: { files: AuthFileItem[] }) => void = () => {};
    mocks.list.mockImplementationOnce(
      () =>
        new Promise<{ files: AuthFileItem[] }>((resolve) => {
          resolveList = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText("tenant-a.json")).not.toBeInTheDocument();
    expect(await screen.findByTestId("auth-files-table-skeleton")).toBeInTheDocument();

    resolveList({
      files: [
        {
          name: "tenant-b.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        } as AuthFileItem,
      ],
    });
    expect(await screen.findByText("tenant-b.json")).toBeInTheDocument();
    expect(screen.queryByText("tenant-a.json")).not.toBeInTheDocument();
  });

  test("restores last data on route switch and refreshes quietly", async () => {
    const wrap = (node: ReactNode) => (
      <ThemeProvider>
        <ToastProvider>{node}</ToastProvider>
      </ThemeProvider>
    );

    const router = createMemoryRouter(
      [
        { path: "/auth-files", element: wrap(<AuthFilesPage />) },
        { path: "/access/api-keys", element: wrap(<div>api keys</div>) },
      ],
      { initialEntries: ["/auth-files"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();

    await act(async () => {
      await router.navigate("/access/api-keys");
    });
    expect(screen.getByText("api keys")).toBeInTheDocument();

    mocks.list.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          window.setTimeout(() => {
            resolve({
              files: [
                {
                  name: "qwen.json",
                  type: "qwen",
                  size: 1024,
                  modified: Date.now(),
                  disabled: false,
                },
              ],
            });
          }, 200);
        }),
    );

    await act(async () => {
      await router.navigate("/auth-files");
    });

    // Should render immediately from localStorage cache (no blank state)
    expect(screen.getByText("qwen.json")).toBeInTheDocument();
  });

  test("refreshes visible quota when entering auth files from another route with auto-refresh off", async () => {
    const now = Date.now();
    const file = {
      name: "codex-visible.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex-visible",
      chatgpt_account_id: "acct-visible",
      size: 1024,
      modified: now,
      disabled: false,
    };

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 88 }],
    });
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-visible.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 22 }],
          },
        },
      }),
    );

    const wrap = (node: ReactNode) => (
      <ThemeProvider>
        <ToastProvider>{node}</ToastProvider>
      </ThemeProvider>
    );
    const router = createMemoryRouter(
      [
        { path: "/auth-files", element: wrap(<AuthFilesPage />) },
        { path: "/access/api-keys", element: wrap(<div>api keys</div>) },
      ],
      { initialEntries: ["/access/api-keys"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("api keys")).toBeInTheDocument();
    await act(async () => {
      await router.navigate("/auth-files");
    });

    expect(await screen.findByText("codex-visible.json")).toBeInTheDocument();
    // Enter route: status snapshot + quiet force probe for visible cards (auto-refresh off).
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
    expect(mocks.startStatusRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_indexes: [file.auth_index],
        force: true,
      }),
      expect.anything(),
    );
  });

  test("refreshes quota for a newly authorized auth file", async () => {
    const now = Date.now();
    const initialFile = {
      name: "qwen.json",
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
    };
    const authorizedFile = {
      name: "codex-authorized.json",
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      auth_index: "auth-codex-authorized",
      chatgpt_account_id: "acct-authorized",
      size: 2048,
      modified: now + 1,
      disabled: false,
    };

    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list
      .mockImplementationOnce(async () => ({ files: [initialFile] }))
      .mockImplementation(async () => ({ files: [initialFile, authorizedFile] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 91 }],
    });

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add OAuth Login" }));

    const dialog = await screen.findByRole("dialog", { name: "Add OAuth Login" });
    fireEvent.change(
      within(dialog).getByPlaceholderText("Paste the full callback URL from browser"),
      {
        target: { value: "http://localhost:1455/auth/callback?code=ok" },
      },
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Submit callback" }));

    expect(await screen.findByText("codex-authorized.json")).toBeInTheDocument();
    // New visible scope: snapshot + quiet probe (not the legacy per-file fetchQuota fan-out).
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
  });

  test("ignores the legacy quota preview setting and keeps a plain quota header", async () => {
    useTableFilesView();
    window.localStorage.setItem("authFilesPage.quotaPreview.v1", JSON.stringify("week"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Quota" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Quota" })).toHaveTextContent("Quota");
    expect(screen.queryByRole("columnheader", { name: "Size" })).not.toBeInTheDocument();
  });

  test("reads files view mode from localStorage", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    // non-quota providers should not show Codex-specific quota labels
    expect(screen.queryByText("Code: 5h")).not.toBeInTheDocument();
  });

  test("cards view only shows non-duplicated auth-file tags", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: ["vip-team"],
          hidden_default_tags: [],
          display_tags: ["codex", "pro", "vip-team"],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("vip-team")).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByText(/^codex$/i)).toHaveLength(1);
    // Membership chip is PRO (not soft sky "pro" tag); only one membership badge.
    expect(within(card as HTMLElement).getByTestId("auth-file-plan-badge")).toHaveTextContent(
      "PRO",
    );
    expect(within(card as HTMLElement).queryByText("pro")).not.toBeInTheDocument();
  });

  test("table view shows cycle calls without shared-scope or lifetime noise", async () => {
    useTableFilesView();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-shared.json",
          label: "Shared Codex",
          account_type: "oauth",
          type: "codex",
          auth_index: "shared-77",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "shared-77",
          auth_subject_id: "shared-subject",
          subject_scope: "shared",
          share_eligible: true,
          quotas: [],
          usage: {
            cycle_request_total: 7,
            cycle_known: true,
            request_total: 99,
            success_total: 90,
            failure_total: 9,
          },
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("Shared Codex");
    const row = title.closest("tr");
    expect(row).not.toBeNull();
    expect(screen.getByRole("columnheader", { name: "Cycle calls" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Account scope" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Lifetime calls" })).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Shared account")).not.toBeInTheDocument();
    expect(await within(row as HTMLElement).findByText("7")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("90")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("9")).toBeInTheDocument();
  });

  test("cards view shows the auth-file success rate beside call volume", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          auth_index: "77",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) =>
      createAuthFileTrend(authIndex, 5),
    );
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "77",
          auth_subject_id: "77",
          subject_scope: "tenant",
          share_eligible: false,
          quotas: [],
          usage: {
            cycle_request_total: 5,
            cycle_known: true,
            request_total: 5,
            success_total: 4,
            failure_total: 1,
            request_total_30d: 5,
            success_total_30d: 4,
            failure_total_30d: 1,
          },
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    // Status usage is async; wait for cycle volume before asserting success rate.
    expect(await within(card as HTMLElement).findByText("Cycle 5")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Success Rate")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("80.0%")).toBeInTheDocument();
  });

  test("cards view shows current cycle call volume from auth-file trend", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          auth_index: "77",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "77",
          auth_subject_id: "77",
          subject_scope: "tenant",
          share_eligible: false,
          quotas: [],
          usage: {
            cycle_request_total: 7,
            cycle_total_tokens: 1234567,
            cycle_known: true,
            request_total: 99,
            success_total: 99,
            failure_total: 0,
            request_total_30d: 99,
            success_total_30d: 99,
            failure_total_30d: 0,
          },
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(await within(card as HTMLElement).findByText("Cycle 7")).toBeInTheDocument();
    const tokenBadge = within(card as HTMLElement).getByText("Cycle tokens 1.2M");
    expect(tokenBadge).toBeInTheDocument();
    await userEvent.hover(tokenBadge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Cycle tokens 1,234,567");
    expect(within(card as HTMLElement).queryByText("Lifetime 99")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("Tenant only")).not.toBeInTheDocument();
    expect(
      within(card as HTMLElement).queryByText("Success 99 / Failed 0"),
    ).not.toBeInTheDocument();
    expect(mocks.getStatus).toHaveBeenCalled();
  });

  test("warm-paints cached cycle and success rate while a partial status GET resolves", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    const file = {
      name: "codex-cycle.json",
      label: "Cycle Cached",
      account_type: "oauth",
      type: "codex",
      auth_index: "cycle-93",
      size: 1024,
      modified: Date.now(),
      disabled: false,
    };
    writeAuthFilesDataCache({
      tenantId: DEFAULT_CACHE_TENANT_ID,
      savedAtMs: Date.now(),
      files: [file],
      usageData: {
        source: [],
        auth_index: [
          { entity_name: "cycle-93", requests: 93, failed: 1, avg_latency: 0, total_tokens: 0 },
        ],
      },
      cycleByAuthIndex: {
        "cycle-93": {
          calls: 93,
          cycleCostTotal: null,
          cycleTotalTokens: 987654,
          weeklyQuotaUsedPercent: null,
        },
      },
    });
    mocks.list.mockImplementation(async () => ({ files: [file] }));
    const statusDeferred = createDeferred<{ items: Array<Record<string, unknown>> }>();
    mocks.getStatus.mockImplementation(() => statusDeferred.promise);

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("Cycle Cached");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Cycle 93")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Cycle tokens 987.7K")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("98.9%")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Refresh" })[0]?.querySelector("svg")).toHaveClass(
      "animate-spin",
    );

    await act(async () => {
      statusDeferred.resolve({
        items: [
          {
            auth_index: "cycle-93",
            quotas: [],
            usage: {
              cycle_request_total: 98,
              cycle_known: true,
              request_total: 200,
            },
          },
        ],
      });
      await statusDeferred.promise;
    });

    expect(await within(card as HTMLElement).findByText("Cycle 98")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Cycle tokens 987.7K")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("98.9%")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("100.0%")).not.toBeInTheDocument();
  });

  test("warm-paints cached connectivity while the status snapshot is pending", async () => {
    useTableFilesView();
    const file = {
      name: "claude-connectivity.json",
      label: "Claude Connectivity",
      account_type: "oauth",
      type: "anthropic",
      auth_index: "claude-connectivity",
      size: 1024,
      modified: Date.now(),
      disabled: false,
    } as AuthFileItem;
    writeAuthFilesDataCache({
      tenantId: DEFAULT_CACHE_TENANT_ID,
      savedAtMs: Date.now(),
      files: [file],
      connectivityByFileName: {
        [file.name]: { latencyMs: 88, error: false },
      },
    });
    mocks.list.mockResolvedValue({ files: [file] });
    mocks.getStatus.mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const row = (await screen.findByText("Claude Connectivity")).closest("tr");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByRole("button", { name: "Check connectivity" }),
    ).toHaveTextContent("88ms");
  });

  test("cards view shows unknown cycle without lifetime/scope noise when weekly cycle is unknown", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "xai-user.json",
          type: "xai",
          provider: "xai",
          account_type: "oauth",
          email: "user@example.com",
          auth_index: "xai-auth",
          size: 2048,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.getEntityStats.mockImplementation(
      async () =>
        ({
          source: [],
          auth_index: [
            { entity_name: "xai-auth", requests: 116, failed: 0, avg_latency: 0, total_tokens: 0 },
          ],
        }) as any,
    );
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "xai-auth",
          auth_subject_id: "xai-subject",
          subject_scope: "shared",
          share_eligible: true,
          plan_type: "supergrok",
          quotas: [],
          usage: {
            request_total: 116,
            success_total: 116,
            failure_total: 0,
            projected_since: "2026-06-15T00:00:00Z",
            history_complete: false,
            cycle_request_total: 0,
            cycle_known: false,
          },
        },
      ],
    }));
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) => ({
      auth_index: authIndex,
      days: 7,
      hours: 5,
      request_total: 116,
      cycle_request_total: 0,
      cycle_cost_total: 0,
      weekly_quota_used_percent: null,
      cycle_known: false,
      cycle_start: "",
      daily_usage: [{ date: "2026-07-08", requests: 116, cost: 0.12 }],
      hourly_usage: [],
      quota_series: [],
    }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        {
          key: "weekly_limit",
          label: "xai_quota.weekly_limit",
          percent: 75,
          value: "75%",
          windowSeconds: 604800,
        },
      ],
      planType: "supergrok",
    });

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("user@example.com");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    // Prefer request_total over a misleading cycle_request_total of 0 when cycle_known is false.
    expect(await within(card as HTMLElement).findByText("Cycle --")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Cycle tokens --")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("Lifetime 116")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("SUPERGROK")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("Shared account")).not.toBeInTheDocument();
    expect(mocks.getStatus).toHaveBeenCalled();
  });

  test("filters auth files by custom tag options", async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-vip.json",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["vip-team"],
          display_tags: ["vip-team"],
        },
        {
          name: "qwen-lab.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["lab"],
          display_tags: ["lab"],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-vip.json")).toBeInTheDocument();
    expect(screen.getByText("qwen-lab.json")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    await user.click(screen.getByRole("option", { name: "vip-team" }));

    expect(screen.getByText("codex-vip.json")).toBeInTheDocument();
    expect(screen.queryByText("qwen-lab.json")).not.toBeInTheDocument();
    expect(screen.getByText("Total 1 · Page 1 / 1")).toBeInTheDocument();
  });

  test("keeps an emptied custom tag filter clearable after deleting selected files", async () => {
    const user = userEvent.setup();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-vip.json",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["vip-team"],
          display_tags: ["vip-team"],
        },
        {
          name: "qwen-lab.json",
          type: "qwen",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          custom_tags: ["lab"],
          display_tags: ["lab"],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-vip.json")).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    await user.click(screen.getByRole("option", { name: "vip-team" }));

    fireEvent.click(screen.getByLabelText("Select codex-vip.json"));
    fireEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByText("codex-vip.json")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    await user.click(screen.getByRole("option", { name: "All tags" }));

    expect(await screen.findByText("qwen-lab.json")).toBeInTheDocument();
  });

  test("keeps custom tag filter options stable while searching", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-tagged.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
          custom_tags: ["vip-team"],
          display_tags: ["vip-team"],
        },
        {
          name: "codex-plain.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "qwen-plain.json",
          type: "qwen",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-tagged.json")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Custom tag" })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Filename / provider / type"), "plain");

    expect(screen.queryByText("codex-tagged.json")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Custom tag" })).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Custom tag" }));
    expect(screen.getByRole("option", { name: "vip-team" })).toBeInTheDocument();
  });

  test("keeps type filter counts stable while searching", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-alpha.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "codex-beta.json",
          type: "codex",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "qwen-lab.json",
          type: "qwen",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-alpha.json")).toBeInTheDocument();
    const fileGroupSelect = screen.getByRole("combobox", { name: "File group" });
    expect(fileGroupSelect).toHaveTextContent(/All3/);
    await user.click(fileGroupSelect);
    expect(await screen.findByRole("option", { name: /codex\s*2/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /qwen\s*1/i })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /All\s*3/i }));

    await user.type(screen.getByPlaceholderText("Filename / provider / type"), "alpha");

    expect(screen.getByText("codex-alpha.json")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("codex-beta.json")).not.toBeInTheDocument());
    expect(screen.queryByText("qwen-lab.json")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "File group" })).toHaveTextContent(/All3/);
  });

  test("refreshes only the clicked auth-file card cycle call count after quota refresh", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-pro-a.json",
        label: "A_GptPro",
        account_type: "oauth",
        type: "codex",
        auth_index: "77",
        size: 1024,
        modified: now,
        disabled: false,
      },
      {
        name: "codex-pro-b.json",
        label: "B_GptPro",
        account_type: "oauth",
        type: "codex",
        auth_index: "88",
        size: 1024,
        modified: now,
        disabled: false,
      },
    ] as any[];
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        quotaByFileName: {
          "codex-pro-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 80 }],
          },
          "codex-pro-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ key: "code_5h", label: "m_quota.code_5h", percent: 80 }],
          },
        },
      }),
    );
    mocks.list.mockImplementation(async () => ({ files }));
    mocks.getEntityStats
      .mockResolvedValueOnce({
        source: [],
        auth_index: [
          { entity_name: "77", requests: 1, failed: 0, avg_latency: 0, total_tokens: 0 },
          { entity_name: "88", requests: 10, failed: 0, avg_latency: 0, total_tokens: 0 },
        ],
      } as any)
      .mockResolvedValueOnce({
        source: [],
        auth_index: [
          { entity_name: "77", requests: 4, failed: 1, avg_latency: 0, total_tokens: 0 },
          { entity_name: "88", requests: 99, failed: 0, avg_latency: 0, total_tokens: 0 },
        ],
      } as any);
    mocks.fetchQuota.mockImplementation(async () => [
      { key: "code_5h", label: "m_quota.code_5h", percent: 60 },
    ]);
    // Stable until card refresh advances 77 → 4 (enter quiet probe must not burn the sequence).
    const cycleCountByAuthIndex = new Map<string, number>([
      ["77", 1],
      ["88", 10],
    ]);
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) =>
      createAuthFileTrend(authIndex, cycleCountByAuthIndex.get(authIndex) ?? 0),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    const otherTitle = await screen.findByText("B_GptPro");
    const otherCard = otherTitle.closest("section");
    expect(otherCard).not.toBeNull();
    expect(await within(card as HTMLElement).findByText("Cycle 1")).toBeInTheDocument();
    expect(await within(otherCard as HTMLElement).findByText("Cycle 10")).toBeInTheDocument();

    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
    mocks.fetchQuota.mockClear();
    mocks.startStatusRefresh.mockClear();
    cycleCountByAuthIndex.set("77", 4);

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalled();
      expect(mocks.getEntityStats).not.toHaveBeenCalled();
      expect(within(card as HTMLElement).getByText("Cycle 4")).toBeInTheDocument();
      expect(within(otherCard as HTMLElement).getByText("Cycle 10")).toBeInTheDocument();
      expect(within(otherCard as HTMLElement).queryByText("Cycle 99")).not.toBeInTheDocument();
    });
  });

  test("toolbar refresh uses one batch status job instead of per-account fan-out", async () => {
    const now = Date.now();
    const files = Array.from({ length: 9 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      provider: "codex",
      account_type: "oauth",
      chatgpt_account_id: `acct-${index + 1}`,
      auth_index: String(index + 1),
      size: 1024,
      modified: now,
      disabled: false,
    }));

    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          files.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22 }],
            },
          ]),
        ),
      }),
    );

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 60 }],
    });

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    mocks.startStatusRefresh.mockClear();
    mocks.getStatusRefreshJob.mockClear();
    mocks.fetchQuota.mockClear();

    const refreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getStatusRefreshJob).toHaveBeenCalledTimes(1);
    });
    const firstCall = (
      mocks.startStatusRefresh.mock.calls as unknown as Array<[{ auth_indexes?: string[] }]>
    )[0];
    expect(firstCall).toBeDefined();
    const payload = firstCall?.[0];
    expect(payload?.auth_indexes).toHaveLength(9);
    expect(mocks.fetchQuota).toHaveBeenCalled(); // bridge probes only during batch job
  });

  test("switching to all refreshes the visible page even when file names stay the same", async () => {
    const now = Date.now();
    const codexFiles = Array.from({ length: 10 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: String(index + 1),
    }));
    const files = [
      ...codexFiles,
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: now,
        disabled: false,
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 66, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(10000));
    writeAuthFilesUiState({ tab: "files", filter: "codex", search: "", page: 1 });
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          codexFiles.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
            },
          ]),
        ),
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    mocks.startStatusRefresh.mockClear();
    mocks.fetchQuota.mockClear();

    await selectFileGroup(/^All/i);

    // First page of All may still be the same 9 codex auth_indexes; scope GET is deduped.
    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    expect(mocks.startStatusRefresh).not.toHaveBeenCalled();
    // No per-account probe fan-out on filter switch.
    expect(mocks.fetchQuota).not.toHaveBeenCalled();
  });

  test("switching provider after entering from request logs refreshes visible cards with auto-refresh off", async () => {
    const now = Date.now();
    const qwenFiles = Array.from({ length: 2 }, (_, index) => ({
      name: `qwen-${index + 1}.json`,
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: `qwen-${index + 1}`,
    }));
    const codexFiles = Array.from({ length: 2 }, (_, index) => ({
      name: `codex-${index + 1}.json`,
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: `codex-${index + 1}`,
    }));
    const files = [...qwenFiles, ...codexFiles] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 66, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    writeAuthFilesUiState({ tab: "files", filter: "qwen", search: "", page: 1 });
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: Object.fromEntries(
          qwenFiles.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
            },
          ]),
        ),
      }),
    );

    const router = createMemoryRouter(
      [
        { path: "/runtime/request-logs", element: <div>request logs</div> },
        {
          path: "/auth-files",
          element: (
            <ThemeProvider>
              <ToastProvider>
                <AuthFilesPage />
              </ToastProvider>
            </ThemeProvider>
          ),
        },
      ],
      { initialEntries: ["/runtime/request-logs"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("request logs")).toBeInTheDocument();
    await act(async () => {
      await router.navigate("/auth-files");
    });

    expect(await screen.findByText("qwen-1.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    const statusBefore = mocks.getStatus.mock.calls.length;
    mocks.startStatusRefresh.mockClear();
    mocks.fetchQuota.mockClear();

    await selectFileGroup(/^codex\s*2/i);

    expect(await screen.findByText("codex-1.json")).toBeInTheDocument();
    await waitFor(() => expect(mocks.getStatus.mock.calls.length).toBeGreaterThan(statusBefore));
    // provider/scope switch reloads snapshot and quietly re-probes the new visible cards
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
  });

  test("cards view hides default auth-file badges when display tags are empty", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: ["codex", "pro"],
          display_tags: [],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const card = title.closest("section");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).queryByText(/^codex$/i)).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText("Plan Pro")).not.toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("Cycle --")).toBeInTheDocument();
  });

  test("table view hides default auth-file badges when display tags are empty", async () => {
    useTableFilesView();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          plan_type: "pro",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: ["codex", "pro"],
          display_tags: [],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("A_GptPro");
    const row = title.closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText(/^codex$/i)).not.toBeInTheDocument();
    expect(within(row as HTMLElement).queryByText("Plan Pro")).not.toBeInTheDocument();
  });

  test("saves auth-file tag visibility and custom tags from the tags modal", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pro.json",
          label: "A_GptPro",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          default_tags: ["codex", "pro"],
          custom_tags: [],
          hidden_default_tags: [],
          display_tags: ["codex", "pro"],
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    expect(await screen.findByText("A_GptPro")).toBeInTheDocument();
    // Cards view keeps tags under the overflow menu (table view may show it inline).
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit Tags" }));

    const dialog = await screen.findByRole("dialog", { name: "Auth File Tags" });
    fireEvent.change(within(dialog).getByLabelText("Custom tag"), { target: { value: "vip" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add tag" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "pro" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.patchFields).toHaveBeenCalledWith({
        name: "codex-pro.json",
        custom_tags: ["vip"],
        hidden_default_tags: ["pro"],
        display_tags: ["codex", "vip"],
      }),
    );
  });

  test("uses channel name as display name and sorts by channel name", async () => {
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "z-last.json",
          label: "Alpha Channel",
          account_type: "oauth",
          type: "codex",
          auth_index: "2",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "codex-prod.json",
          label: "Beta Channel",
          account_type: "oauth",
          type: "codex",
          plan_type: "plus",
          auth_index: "1",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "1",
          plan_type: "plus",
          quotas: [],
          usage: {
            cycle_request_total: 9,
            cycle_known: true,
            request_total: 9,
            success_total: 7,
            failure_total: 2,
            request_total_30d: 9,
            success_total_30d: 7,
            failure_total_30d: 2,
          },
        },
        {
          auth_index: "2",
          quotas: [],
          usage: {
            cycle_request_total: 2,
            cycle_known: true,
            request_total: 2,
            success_total: 2,
            failure_total: 0,
            request_total_30d: 2,
            success_total_30d: 2,
            failure_total_30d: 0,
          },
        },
      ],
    }));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Alpha Channel")).toBeInTheDocument();
    expect(screen.getAllByText("Beta Channel").length).toBeGreaterThan(0);
    expect(screen.queryByText("z-last.json")).not.toBeInTheDocument();
    expect(screen.queryByText("codex-prod.json")).not.toBeInTheDocument();
    expect(screen.getAllByText("PLUS").length).toBeGreaterThan(0);
    expect(await screen.findByText("Cycle 9")).toBeInTheDocument();

    const cards = screen.getByTestId("auth-files-cards");
    expect(cards.textContent?.indexOf("Alpha Channel")).toBeLessThan(
      cards.textContent?.indexOf("Beta Channel") ?? Number.MAX_SAFE_INTEGER,
    );
  });

  test("uses natural sorting for displayed channel names", async () => {
    const now = Date.now();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "c.json",
          label: "gptplus10",
          account_type: "oauth",
          type: "codex",
          auth_index: "3",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "a.json",
          label: "gptplus1",
          account_type: "oauth",
          type: "codex",
          auth_index: "1",
          size: 1024,
          modified: now,
          disabled: false,
        },
        {
          name: "b.json",
          label: "gptplus2",
          account_type: "oauth",
          type: "codex",
          auth_index: "2",
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("gptplus1")).toBeInTheDocument();

    const cards = screen.getByTestId("auth-files-cards");
    const text = cards.textContent ?? "";
    expect(text.indexOf("gptplus1")).toBeLessThan(text.indexOf("gptplus2"));
    expect(text.indexOf("gptplus2")).toBeLessThan(text.indexOf("gptplus10"));
  });

  test("shows derived subscription days remaining in table and cards", async () => {
    useTableFilesView();
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const startedAt = new Date(expiresAt);
    startedAt.setFullYear(startedAt.getFullYear() - 1);
    const expiresSoonAt = new Date(Date.now() + 60 * 60 * 1000);
    const startedSoonAt = new Date(expiresSoonAt);
    startedSoonAt.setFullYear(startedSoonAt.getFullYear() - 1);
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-subscription.json",
          label: "Codex Subscriber",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          subscription_started_at: startedAt.toISOString(),
          subscription_period: "yearly",
        },
        {
          name: "codex-subscription-expiring-soon.json",
          label: "Codex Subscriber Expiring Soon",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          subscription_started_at: startedSoonAt.toISOString(),
          subscription_period: "yearly",
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex Subscriber")).toBeInTheDocument();
    expect(screen.getByText("Subscription")).toBeInTheDocument();
    expect(screen.getByText(/5d left/)).toBeInTheDocument();
    expect(screen.getByText("<1d left")).toBeInTheDocument();

    cleanup();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.getByText(/5d left/)).toBeInTheDocument();
    expect(screen.getByText("<1d left")).toBeInTheDocument();
  });

  test("saves subscription start and period from the auth fields editor", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-subscription.json",
          label: "Codex Subscriber",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.downloadText.mockImplementation(async () =>
      JSON.stringify(
        {
          type: "codex",
          subscription_started_at: "2027-01-02T03:04:00Z",
          subscription_period: "monthly",
          subscription_expires_at: "2099-01-01T00:00:00Z",
        },
        null,
        2,
      ),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex Subscriber")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(await screen.findByRole("tab", { name: "Fields" }));

    const input = await screen.findByLabelText("Subscription start date");
    fireEvent.change(input, { target: { value: "2027-01-03T04:05" } });
    fireEvent.click(screen.getByRole("combobox", { name: "Subscription cycle" }));
    fireEvent.click(await screen.findByRole("option", { name: "Yearly" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(1));
    const uploadCalls = mocks.upload.mock.calls as unknown as [[File]];
    const uploaded = uploadCalls[0][0];
    const uploadedJson = JSON.parse(await uploaded.text()) as Record<string, unknown>;
    expect(uploadedJson.subscription_started_at).toBe(new Date("2027-01-03T04:05").toISOString());
    expect(uploadedJson.subscription_period).toBe("yearly");
    expect(uploadedJson.subscription_expires_at).toBeUndefined();
  });

  test("shows card subscription badge from shared provider subscription", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-subscription.json",
          label: "Codex Subscriber",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          shared_subscription_started_at: new Date(
            Date.now() - 5 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          shared_subscription_expires_at: new Date(
            Date.now() + 26 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          shared_subscription_source: "signed_claims",
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-cards")).toHaveTextContent(/d left/);
  });

  test("opens usage trend cards for codex files inferred from dotted email file names", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-pcamtu927@gmail.com-plus.json",
          type: "codex",
          auth_index: "auth-1",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));
    mocks.downloadText.mockImplementation(async () => JSON.stringify({ type: "codex" }, null, 2));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const cards = await screen.findByTestId("auth-files-cards");
    expect(cards).toHaveTextContent("pcamtu927@gmail.com");

    fireEvent.click(within(cards).getByRole("button", { name: "Details" }));

    const dialog = await screen.findByRole("dialog", {
      name: "pcamtu927@gmail.com",
    });
    expect(within(dialog).getByText("PLUS")).toBeInTheDocument();
    expect(within(dialog).getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(await within(dialog).findByText("Current cycle cost")).toBeInTheDocument();
    expect(within(dialog).getByText("$1.2345")).toBeInTheDocument();
    expect(within(dialog).getByText("Current cycle tokens")).toBeInTheDocument();
    expect(within(dialog).getByText("1,234,567")).toBeInTheDocument();
    expect(mocks.getAuthFileTrend).toHaveBeenCalledWith("auth-1", { days: 7, hours: 5 });
  });

  test("sets model owner group from an icon modal after enabling override", async () => {
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex.json",
          label: "Codex Main",
          account_type: "oauth",
          type: "codex",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    }));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    await selectFileGroup(/codex\s*1/i);

    expect(
      screen.queryByText("No owner group selected; each auth file uses live model query."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model owner group" })).not.toBeInTheDocument();

    const settingsButton = screen.getByRole("button", { name: "Model owner group" });
    fireEvent.mouseEnter(settingsButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Model owner group");
    fireEvent.mouseLeave(settingsButton);

    fireEvent.click(settingsButton);
    const settingsDialog = await screen.findByRole("dialog", { name: "Model owner group" });
    const overrideSwitch = within(settingsDialog).getByRole("switch", {
      name: "Enable owner group override",
    });
    expect(overrideSwitch).toHaveAttribute("aria-checked", "false");
    fireEvent.click(overrideSwitch);
    expect(overrideSwitch).toHaveAttribute("aria-checked", "true");

    const ownerSelect = within(settingsDialog).getByRole("combobox", {
      name: "Model owner group",
    });
    fireEvent.click(ownerSelect);
    fireEvent.click(await screen.findByRole("option", { name: "OpenAI" }));

    expect(ownerSelect).toHaveTextContent("OpenAI");
    expect(await within(settingsDialog).findByText("gpt-4.1")).toBeInTheDocument();
    expect(within(settingsDialog).queryByText("claude-sonnet-4-5")).not.toBeInTheDocument();
    expect(authGroupOwnerMappingMap).toEqual({});

    fireEvent.click(within(settingsDialog).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(mocks.saveAuthGroupModelOwnerMapping).toHaveBeenCalledWith("codex", "openai");
    });
    expect(authGroupOwnerMappingMap).toEqual({ codex: "openai" });

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const dialog = await screen.findByRole("dialog", { name: "Codex Main" });
    fireEvent.click(within(dialog).getByRole("tab", { name: "Models" }));

    expect(
      within(dialog).queryByRole("combobox", { name: "Model owner group" }),
    ).not.toBeInTheDocument();
    expect(await within(dialog).findByText("gpt-4.1")).toBeInTheDocument();
    expect(within(dialog).queryByText("live-only")).not.toBeInTheDocument();
    expect(mocks.getModelConfigs).toHaveBeenCalledWith("library");
    expect(mocks.getModelOwnerPresets).toHaveBeenCalledTimes(1);
  });

  test("cards view shows codex quota bars by stable label keys (no quota tooltip)", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 34, resetAtMs: now + 120_000 },
        { label: "m_quota.review_weekly", percent: 56, resetAtMs: now + 180_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: 5h")).toBeInTheDocument();
    expect(screen.getByText("Code: Weekly")).toBeInTheDocument();
    expect(screen.getByText("Review: Weekly")).toBeInTheDocument();
    expect(await screen.findByText("12%")).toBeInTheDocument();
    expect(screen.getByText("34%")).toBeInTheDocument();
    expect(screen.getByText("56%")).toBeInTheDocument();

    const quotaLabel = screen.getByText("Code: 5h");
    fireEvent.mouseEnter(quotaLabel);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("cards view does not schedule quota countdown ticks when auto-refresh is off", async () => {
    const now = Date.parse("2026-05-12T08:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const intervalSpy = vi.spyOn(window, "setInterval");
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 10_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const cards = await screen.findByTestId("auth-files-cards");
    expect(within(cards).getByText("10s")).toBeInTheDocument();
    expect(intervalSpy.mock.calls.some(([, delay]) => delay === 10_000)).toBe(false);
  });

  test("cards view keeps weekly quota reset separate from five-hour reset and hides file modified time", async () => {
    const now = Date.parse("2026-05-12T08:00:00.000Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;
    const modifiedText = new Date(now).toLocaleString();

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "code_5h",
                label: "m_quota.code_5h",
                percent: 100,
                resetAtMs: now + 5 * 60 * 60 * 1000,
              },
              {
                key: "code_week",
                label: "m_quota.code_weekly",
                percent: 0,
                resetAtMs: now + 6 * 24 * 60 * 60 * 1000,
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const title = await screen.findByText("codex.json");
    const card = title.closest("section");
    expect(card).not.toBeNull();

    expect(within(card as HTMLElement).getByText("5h0s")).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText("6d0s")).toBeInTheDocument();
    expect(within(card as HTMLElement).queryByText(modifiedText)).not.toBeInTheDocument();
  });

  test("cards view shows sub2api-style Antigravity quota summaries", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              { key: "model:gemini-3.1-pro-high", label: "Model A [gemini-a]", percent: 91 },
              { key: "model:gemini-3.1-pro-low", label: "Model B [gemini-b]", percent: 82 },
              { key: "model:gemini-3-flash", label: "Model Flash [gemini-flash]", percent: 77 },
              {
                key: "model:gemini-3.1-flash-image",
                label: "Model Image [gemini-image]",
                percent: 65,
              },
              { key: "model:claude-sonnet-4-6", label: "Model C [claude-c]", percent: 73 },
              { key: "model:gpt-oss-120b-medium", label: "Model D [gpt-d]", percent: 64 },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(within(cards).getByText("Gemini 3 Pro")).toBeInTheDocument();
    expect(within(cards).getByText("Gemini 3 Flash")).toBeInTheDocument();
    expect(within(cards).getByText("Gemini 3.1 Flash Image")).toBeInTheDocument();
    expect(within(cards).getByText("Claude")).toBeInTheDocument();
    expect(within(cards).getByText("82%")).toBeInTheDocument();
    expect(within(cards).getByText("77%")).toBeInTheDocument();
    expect(within(cards).getByText("65%")).toBeInTheDocument();
    expect(within(cards).getByText("73%")).toBeInTheDocument();
    expect(within(cards).queryByText("Model A [gemini-a]")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Model B [gemini-b]")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Model Flash [gemini-flash]")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Model Image [gemini-image]")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Model C [claude-c]")).not.toBeInTheDocument();
    expect(within(cards).queryByText("Model D [gpt-d]")).not.toBeInTheDocument();
  });

  test("cards view hides cached antigravity models skipped by the reference implementation", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
              },
              { key: "model:chat_20706", label: "chat_20706", percent: 100 },
              { key: "model:chat_23310", label: "chat_23310", percent: 100 },
              {
                key: "model:tab_flash_lite_preview",
                label: "tab_flash_lite_preview",
                percent: 100,
              },
              {
                key: "model:tab_jump_flash_lite_preview",
                label: "tab_jump_flash_lite_preview",
                percent: 100,
              },
              {
                key: "model:gemini-2.5-flash-thinking",
                label: "Gemini 3.1 Flash Lite [gemini-2.5-flash-thinking]",
                percent: 100,
              },
              {
                key: "model:gemini-2.5-pro",
                label: "Gemini 2.5 Pro [gemini-2.5-pro]",
                percent: 100,
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(within(cards).getByText("Gemini 3 Pro")).toBeInTheDocument();
    expect(
      within(cards).queryByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText("chat_20706")).not.toBeInTheDocument();
    expect(within(cards).queryByText("chat_23310")).not.toBeInTheDocument();
    expect(within(cards).queryByText("tab_flash_lite_preview")).not.toBeInTheDocument();
    expect(within(cards).queryByText("tab_jump_flash_lite_preview")).not.toBeInTheDocument();
    expect(
      within(cards).queryByText("Gemini 3.1 Flash Lite [gemini-2.5-flash-thinking]"),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText("Gemini 2.5 Pro [gemini-2.5-pro]")).not.toBeInTheDocument();
  });

  test("cards view does not show verbose antigravity model metadata under quota bars", async () => {
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
                meta: "Default Agent · Recommended · maxTokens=1048576 · maxOutputTokens=65535 · apiProvider=API_PROVIDER_GOOGLE_GEMINI · model=MODEL_PLACEHOLDER_M37 · thinking · images · video",
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");

    expect(within(cards).getByText("Gemini 3 Pro")).toBeInTheDocument();
    expect(within(cards).getByText("91%")).toBeInTheDocument();
    expect(
      within(cards).queryByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText(/maxTokens=1048576/)).not.toBeInTheDocument();
    expect(within(cards).queryByText(/maxOutputTokens=65535/)).not.toBeInTheDocument();
    expect(
      within(cards).queryByText(/apiProvider=API_PROVIDER_GOOGLE_GEMINI/),
    ).not.toBeInTheDocument();
    expect(within(cards).queryByText(/model=MODEL_PLACEHOLDER_M37/)).not.toBeInTheDocument();
  });

  test("table quota hover does not show cached antigravity model metadata", async () => {
    useTableFilesView();
    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-low",
                label: "Gemini 3.1 Pro (Low) [gemini-3.1-pro-low]",
                percent: 91,
                resetAtMs: Date.parse("2026-05-09T15:50:29Z"),
                meta: "Recommended · maxTokens=1048576 · maxOutputTokens=65535 · apiProvider=API_PROVIDER_GOOGLE_GEMINI · modelProvider=MODEL_PROVIDER_GOOGLE · model=MODEL_PLACEHOLDER_M36 · tokenizer=LLAMA_WITH_SPECIAL · tag=New · thinkingBudget=1001 · minThinkingBudget=128 · thinking · images · video · recommended",
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(within(row as HTMLElement).getByText("Gemini 3 Pro"));

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Gemini 3 Pro")).toBeInTheDocument();
    expect(
      within(tooltip).queryByText("Gemini 3.1 Pro (Low) [gemini-3.1-pro-low]"),
    ).not.toBeInTheDocument();
    expect(within(tooltip).queryByText(/maxTokens=1048576/)).not.toBeInTheDocument();
    expect(
      within(tooltip).queryByText(/apiProvider=API_PROVIDER_GOOGLE_GEMINI/),
    ).not.toBeInTheDocument();
    expect(
      within(tooltip).queryByText(/modelProvider=MODEL_PROVIDER_GOOGLE/),
    ).not.toBeInTheDocument();
  });

  test("table quota hover opens only the quota details tooltip", async () => {
    useTableFilesView();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(80);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(320);

    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 100,
                resetAtMs: now + 65_000,
              },
              {
                key: "model:claude-sonnet-4-6",
                label: "Claude Sonnet 4.6 (Thinking) [claude-sonnet-4-6]",
                percent: 100,
                resetAtMs: now + 125_000,
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(within(row as HTMLElement).getByText("Gemini 3 Pro"));

    const tooltips = await screen.findAllByRole("tooltip");
    expect(tooltips).toHaveLength(1);
    expect(within(tooltips[0]).getByText("Claude")).toBeInTheDocument();
    const resetText = Array.from(tooltips[0].querySelectorAll("span")).find(
      (element) => element.textContent?.includes("s") && element.className.includes("tabular-nums"),
    );
    expect(resetText).toBeTruthy();
    expect(resetText).not.toHaveClass("truncate");
    expect(tooltips[0]).not.toHaveClass("sm:max-w-[34rem]");
    expect(tooltips[0].querySelector(".quota-tooltip-grid")).toHaveClass(
      "w-[min(26rem,calc(100vw-2rem))]",
    );
  });

  test("table quota preview and hover hide cached antigravity models skipped by the reference implementation", async () => {
    useTableFilesView();

    const now = Date.now();
    const file = {
      name: "antigravity.json",
      type: "antigravity",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "ag",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "antigravity.json": {
            status: "success",
            updatedAt: now,
            items: [
              { key: "model:chat_20706", label: "chat_20706", percent: 100 },
              {
                key: "model:gemini-3.1-pro-high",
                label: "Gemini 3.1 Pro (High) [gemini-3.1-pro-high]",
                percent: 91,
              },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("antigravity.json")).toBeInTheDocument();

    const row = screen.getByText("antigravity.json").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).queryByText("chat_20706")).not.toBeInTheDocument();
    const visibleModel = within(row as HTMLElement).getByText("Gemini 3 Pro");
    expect(visibleModel).toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).not.toBeInTheDocument();

    fireEvent.mouseEnter(visibleModel);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).queryByText("chat_20706")).not.toBeInTheDocument();
    expect(within(tooltip).getByText("Gemini 3 Pro")).toBeInTheDocument();
    expect(
      within(tooltip).queryByText("Gemini 3.1 Pro (High) [gemini-3.1-pro-high]"),
    ).not.toBeInTheDocument();
  });

  test("cards view restores cached quota while refreshing in the background", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now - 60_000,
            items: [
              { label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 44, resetAtMs: now + 120_000 },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex.json")).toBeInTheDocument();
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchQuota).toHaveBeenCalledTimes(1));
    expect(screen.getByText("22%")).toBeInTheDocument();
    expect(screen.getByText("44%")).toBeInTheDocument();
  });

  test("cards view spins current-page refresh actions when switching provider filter and clears them per card", async () => {
    const now = Date.now();
    const files = [
      {
        name: "qwen.json",
        type: "qwen",
        size: 1024,
        modified: now,
        disabled: false,
      },
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
      {
        name: "codex-c.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "3",
      },
    ] as any[];

    const jobDeferred = createDeferred<{
      job_id: string;
      state: string;
      total: number;
      completed: number;
      failed: number;
      results: Array<Record<string, unknown>>;
    }>();
    let hangJobPoll = false;

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 88, resetAtMs: now + 60_000 }],
    });
    // Enter/scope quiet probes complete immediately; hang only the toolbar refresh job.
    mocks.getStatusRefreshJob.mockImplementation(async (...args: unknown[]) => {
      const jobId = typeof args[0] === "string" ? args[0] : "job-enter";
      if (hangJobPoll) return jobDeferred.promise;
      return {
        job_id: jobId,
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      };
    });
    mocks.startStatusRefresh.mockImplementation(async (payload?: { auth_indexes?: string[] }) => ({
      job_id: hangJobPoll ? "job-spin" : "job-enter",
      accepted: payload?.auth_indexes?.length ?? 0,
      deduplicated: 0,
    }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    writeAuthFilesUiState({ tab: "files", filter: "qwen", search: "", page: 1 });
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    await selectFileGroup(/codex\s*3/i);
    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();

    // Drain enter/scope quiet probes so toolbar refresh is not blocked by pageBatchRef.
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    mocks.startStatusRefresh.mockClear();
    mocks.getStatusRefreshJob.mockClear();
    hangJobPoll = true;
    const toolbarRefresh = screen.getAllByRole("button", { name: "Refresh" })[0];
    fireEvent.click(toolbarRefresh);

    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    const payload = (
      mocks.startStatusRefresh.mock.calls as unknown as Array<[{ auth_indexes?: string[] }]>
    )[0]?.[0];
    expect(payload?.auth_indexes?.sort()).toEqual(["1", "2", "3"]);

    const cards = screen.getByTestId("auth-files-cards");
    expect(
      within(cards)
        .getAllByText(/^codex-[abc]\.json$/)
        .map((node) => node.textContent),
    ).toEqual(["codex-a.json", "codex-b.json", "codex-c.json"]);

    const cardA = screen.getByText("codex-a.json").closest("section");
    const cardB = screen.getByText("codex-b.json").closest("section");
    const cardC = screen.getByText("codex-c.json").closest("section");
    expect(cardA).not.toBeNull();
    expect(cardB).not.toBeNull();
    expect(cardC).not.toBeNull();

    const refreshButtonA = within(cardA as HTMLElement).getByRole("button", { name: "Refresh" });
    const refreshButtonB = within(cardB as HTMLElement).getByRole("button", { name: "Refresh" });
    const refreshButtonC = within(cardC as HTMLElement).getByRole("button", { name: "Refresh" });

    await waitFor(() => {
      expect(refreshButtonA.querySelector("svg")).toHaveClass("animate-spin");
      expect(refreshButtonB.querySelector("svg")).toHaveClass("animate-spin");
      expect(refreshButtonC.querySelector("svg")).toHaveClass("animate-spin");
    });

    await act(async () => {
      jobDeferred.resolve({
        job_id: "job-spin",
        state: "completed",
        total: 3,
        completed: 3,
        failed: 0,
        results: ["1", "2", "3"].map((authIndex) => ({
          auth_index: authIndex,
          state: "success",
          result: {
            auth_index: authIndex,
            quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 50 }],
          },
        })),
      });
      await jobDeferred.promise;
    });

    await waitFor(() => {
      expect(refreshButtonA.querySelector("svg")).not.toHaveClass("animate-spin");
      expect(refreshButtonB.querySelector("svg")).not.toHaveClass("animate-spin");
      expect(refreshButtonC.querySelector("svg")).not.toHaveClass("animate-spin");
    });
  });

  test("toolbar refresh immediately spins the visible card quota refresh action", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 60_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const cards = await screen.findByTestId("auth-files-cards");
    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());

    fireEvent.click(toolbarRefreshButton);

    const cardRefreshButton = within(cards).getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(cardRefreshButton.querySelector("svg")).toHaveClass("animate-spin"));
  });

  test("toolbar refresh immediately spins the visible table quota refresh action", async () => {
    useTableFilesView();
    const now = Date.now();
    const file = {
      name: "codex-table.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "3",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-table.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 64, resetAtMs: now + 60_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-table.json")).toBeInTheDocument();
    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());

    fireEvent.click(toolbarRefreshButton);

    const row = screen.getByText("codex-table.json").closest("tr");
    expect(row).not.toBeNull();
    const rowRefreshButton = within(row as HTMLElement).getByRole("button", { name: "Refresh" });
    await waitFor(() => expect(rowRefreshButton.querySelector("svg")).toHaveClass("animate-spin"));
  });

  test("toolbar refresh updates usage stats only for the current card page", async () => {
    const now = Date.now();
    const files = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        name: `auth-${number}.json`,
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: String(number),
      };
    }) as any[];
    const oldStats = files.map((file, index) => ({
      entity_name: file.auth_index,
      requests: index + 1,
      failed: 0,
      avg_latency: 0,
      total_tokens: 0,
    }));

    mocks.list.mockImplementation(async () => ({ files }));
    let useNextUsage = false;
    mocks.getStatus.mockImplementation(async () => ({
      items: files.map((file: { auth_index: string }, index: number) => ({
        auth_index: file.auth_index,
        quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 55 }],
        usage: {
          cycle_request_total: useNextUsage ? 100 + index + 1 : index + 1,
          cycle_known: true,
          request_total: useNextUsage ? 100 + index + 1 : index + 1,
          success_total: useNextUsage ? 100 + index + 1 : index + 1,
          failure_total: 0,
          request_total_30d: useNextUsage ? 100 + index + 1 : index + 1,
          success_total_30d: useNextUsage ? 100 + index + 1 : index + 1,
          failure_total_30d: 0,
        },
      })),
    }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 55, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: oldStats },
        quotaByFileName: Object.fromEntries(
          files.map((file) => [
            file.name,
            {
              status: "success",
              updatedAt: now,
              items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
            },
          ]),
        ),
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const firstTitle = await screen.findByText("auth-1.json");
    const firstCard = firstTitle.closest("section");
    expect(firstCard).not.toBeNull();
    expect(await within(firstCard as HTMLElement).findByText("Cycle 1")).toBeInTheDocument();

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
    mocks.startStatusRefresh.mockClear();
    mocks.getStatus.mockClear();
    useNextUsage = true;

    const toolbarRefreshButton = screen.getAllByRole("button", { name: "Refresh" })[0];
    await waitFor(() => expect(toolbarRefreshButton).toBeEnabled());
    fireEvent.click(toolbarRefreshButton);

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getStatusRefreshJob).toHaveBeenCalled();
      expect(mocks.getStatus).toHaveBeenCalled();
      expect(within(firstCard as HTMLElement).getByText("Cycle 101")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const tenthTitle = await screen.findByText("auth-10.json");
    const tenthCard = tenthTitle.closest("section");
    expect(tenthCard).not.toBeNull();
    // Final snapshot may refresh all accounts; page 2 still shows a finite call badge.
    expect(within(tenthCard as HTMLElement).getByText(/Cycle \d+/)).toBeInTheDocument();
  });

  test("cards view refresh action only refreshes the clicked auth file", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
          },
          "codex-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 44, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");
    const firstCard = screen.getByText("codex-a.json").closest("section");
    expect(firstCard).not.toBeNull();

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    mocks.startStatusRefresh.mockClear();
    mocks.fetchQuota.mockClear();

    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    const payload = (
      mocks.startStatusRefresh.mock.calls as unknown as Array<[{ auth_indexes?: string[] }]>
    )[0]?.[0];
    expect(payload?.auth_indexes).toEqual(["1"]);
    expect(within(cards).getByText("codex-b.json")).toBeInTheDocument();
  });

  test("table refresh action only refreshes the clicked auth file", async () => {
    useTableFilesView();
    const now = Date.now();
    const files = [
      {
        name: "codex-a.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "1",
      },
      {
        name: "codex-b.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "2",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "m_quota.code_5h", percent: 18, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex-a.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 22, resetAtMs: now + 30_000 }],
          },
          "codex-b.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "m_quota.code_5h", percent: 44, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-a.json")).toBeInTheDocument();
    const row = screen.getByText("codex-a.json").closest("tr");
    expect(row).not.toBeNull();

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    mocks.startStatusRefresh.mockClear();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    const payload = (
      mocks.startStatusRefresh.mock.calls as unknown as Array<[{ auth_indexes?: string[] }]>
    )[0]?.[0];
    expect(payload?.auth_indexes).toEqual(["1"]);
    expect(screen.getByText("codex-b.json")).toBeInTheDocument();
  });

  test("cards view includes returned codex review 5h and additional quota bars", async () => {
    const now = Date.now();
    const file = {
      name: "codex-spark.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "7",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
        { label: "m_quota.review_5h", percent: 70, resetAtMs: now + 180_000 },
        { label: "m_quota.review_weekly", percent: 60, resetAtMs: now + 240_000 },
        { label: "GPT-5.3-Codex-Spark: 5h", percent: 100, resetAtMs: now + 300_000 },
        { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 360_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-spark.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Review: 5h")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: 5h")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: Weekly")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  test("cards keep action buttons pinned to the bottom with mixed quota heights", async () => {
    const now = Date.now();
    const files = [
      {
        name: "codex-basic.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "7",
      },
      {
        name: "codex-spark.json",
        type: "codex",
        size: 1024,
        modified: now,
        disabled: false,
        auth_index: "8",
      },
    ] as any[];

    mocks.list.mockImplementation(async () => ({ files }));
    mocks.fetchQuota.mockImplementation(async (_provider, file) => ({
      items:
        file?.name === "codex-spark.json"
          ? [
              { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
              { label: "m_quota.review_5h", percent: 70, resetAtMs: now + 180_000 },
              { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 240_000 },
            ]
          : [
              { label: "m_quota.code_5h", percent: 90, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 80, resetAtMs: now + 120_000 },
            ],
    }));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const cards = await screen.findByTestId("auth-files-cards");
    expect(cards).toHaveClass("items-stretch");

    const refreshButtons = within(cards).getAllByRole("button", { name: "Refresh" });
    refreshButtons.forEach((button) => fireEvent.click(button));

    expect(await screen.findByText("GPT-5.3-Codex-Spark: Weekly")).toBeInTheDocument();

    const card = screen.getByText("codex-basic.json").closest("section");
    expect(card).not.toBeNull();
    expect(card).toHaveClass("flex", "h-full", "flex-col");

    const quota = within(card as HTMLElement).getByTestId("auth-file-card-quota");
    const actions = quota.nextElementSibling;
    expect(actions).not.toBeNull();
    expect(actions).toHaveClass("mt-auto");
  });

  test("cards keep secondary actions inside a more actions menu", async () => {
    const user = userEvent.setup();
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    const cards = await screen.findByTestId("auth-files-cards");
    const card = within(cards).getByText("codex.json").closest("section");
    expect(card).not.toBeNull();
    const cardView = within(card as HTMLElement);

    expect(cardView.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(cardView.getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(cardView.getByRole("button", { name: "More actions" })).toBeInTheDocument();
    expect(cardView.queryByRole("button", { name: "Edit Tags" })).not.toBeInTheDocument();
    expect(cardView.queryByRole("button", { name: "Clear status" })).not.toBeInTheDocument();
    expect(cardView.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();

    await user.click(cardView.getByRole("button", { name: "More actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit Tags" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear status" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Download" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Clear status" }));

    await waitFor(() => expect(mocks.clearStatus).toHaveBeenCalledWith("1"));
  });

  test("cards localize codex additional quota window labels in Chinese", async () => {
    await act(async () => {
      await i18n.changeLanguage("zh-CN");
    });

    const now = Date.now();
    const file = {
      name: "codex-spark.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "8",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "GPT-5.3-Codex-Spark: 5h", percent: 100, resetAtMs: now + 60_000 },
        { label: "GPT-5.3-Codex-Spark: Weekly", percent: 96, resetAtMs: now + 120_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-spark.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "刷新" }),
    );

    expect(await screen.findByText("GPT-5.3-Codex-Spark: 五小时")).toBeInTheDocument();
    expect(screen.getByText("GPT-5.3-Codex-Spark: 周")).toBeInTheDocument();
    expect(screen.queryByText("GPT-5.3-Codex-Spark: 5h")).not.toBeInTheDocument();
    expect(screen.queryByText("GPT-5.3-Codex-Spark: Weekly")).not.toBeInTheDocument();
  });

  test("cards view shows only kimi coding quotas and marks depleted weekly quota red", async () => {
    const now = Date.now();
    const file = {
      name: "kimi.json",
      type: "kimi",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "9",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 100, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 0, resetAtMs: now + 120_000 },
        { label: "m_quota.review_weekly", percent: 56, resetAtMs: now + 180_000 },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("kimi.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: 5h")).toBeInTheDocument();
    expect(screen.getByText("Code: Weekly")).toBeInTheDocument();
    expect(screen.queryByText("Review: Weekly")).not.toBeInTheDocument();
    expect(screen.getByText("0%")).toHaveClass("text-rose-700");
  });

  test("cards view shows codex team subscription quota instead of empty stable placeholders", async () => {
    const now = Date.now();
    const file = {
      name: "codex-team.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "team-1",
      plan_type: "team",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      planType: "team",
      items: [
        {
          key: "code_subscription_2628000",
          label: "m_quota.code_subscription",
          percent: 89,
          resetAtMs: now + 60_000,
          windowSeconds: 2628000,
        },
      ],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-team.json")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );

    expect(await screen.findByText("Code: Subscription")).toBeInTheDocument();
    expect(screen.queryByText("Code: 5h")).not.toBeInTheDocument();
    expect(screen.queryByText("Code: Weekly")).not.toBeInTheDocument();
    expect(screen.getByText("89%")).toBeInTheDocument();
  });

  test("table lays out every quota metric directly and keeps long metrics full width", async () => {
    useTableFilesView();
    const now = Date.now();
    const file = {
      name: "codex-table.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "3",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [
        { label: "m_quota.code_5h", percent: 88, resetAtMs: now + 60_000 },
        { label: "m_quota.code_weekly", percent: 0, resetAtMs: now + 120_000 },
        {
          label: "GPT-5.3-Codex-Spark Extended Reasoning: Weekly",
          percent: 96,
          resetAtMs: now + 180_000,
        },
        { label: "Bonus daily", percent: 54, resetAtMs: now + 240_000 },
      ],
    });
    window.localStorage.setItem("authFilesPage.quotaPreview.v1", JSON.stringify("week"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex-table.json")).toBeInTheDocument();

    const table = screen.getByRole("table");
    const row = screen.getByText("codex-table.json").closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Refresh" }));

    expect(await within(row as HTMLElement).findByText("Code: 5h")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Code: Weekly")).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText("GPT-5.3-Codex-Spark Extended Reasoning: Weekly"),
    ).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Bonus daily")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Quota" })).not.toBeInTheDocument();

    const metrics = within(row as HTMLElement).getAllByTestId("auth-file-quota-metric");
    expect(metrics).toHaveLength(4);
    expect(metrics[0]).toHaveAttribute("data-layout", "compact");
    expect(metrics[1]).toHaveAttribute("data-layout", "compact");
    expect(metrics[2]).toHaveAttribute("data-layout", "wide");
    expect(metrics[3]).toHaveAttribute("data-layout", "wide");

    const previewZero = within(row as HTMLElement).getByText("0%");
    expect(previewZero).toHaveClass("text-rose-700");

    fireEvent.mouseEnter(within(row as HTMLElement).getByText("Code: Weekly"));
    const tooltip = await screen.findByRole("tooltip");
    const tooltipPercents = within(tooltip).getAllByText("0%");
    expect(tooltipPercents[0]).toHaveClass("text-rose-700");

    const actionsHeader = table.querySelector<HTMLElement>('th[data-vt-column-key="actions"]');
    const actionsCell = row?.querySelector<HTMLElement>('td[data-vt-column-key="actions"]');
    expect(actionsHeader).toHaveClass("md:sticky");
    expect(actionsCell).toHaveClass("md:sticky");
  });

  test("quota refresh preserves tenant plan override and updates reset credit badges", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      label: "Codex Main",
      account_type: "oauth",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
      plan_type: "free",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) =>
      createAuthFileTrend(authIndex, 0),
    );
    let resetCredits = 3;
    mocks.fetchQuota.mockImplementation(async () => ({
      items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
      planType: "plus",
      resetCreditCount: resetCredits,
      resetCreditExpirations:
        resetCredits === 3 ? ["2026-07-03T10:00:00Z", "2026-07-04T10:00:00Z"] : undefined,
    }));
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "1",
          plan_type: "plus",
          reset_credit_count: resetCredits,
          reset_credit_expirations:
            resetCredits === 3 ? ["2026-07-03T10:00:00Z", "2026-07-04T10:00:00Z"] : undefined,
          quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 12 }],
        },
      ],
    }));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "free",
            resetCreditCount: 0,
            items: [{ label: "m_quota.code_5h", percent: 20, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    expect(await screen.findByText("Reset 3 times")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");
    const resetButton = within(cards).getByRole("button", { name: "Query reset credits" });
    expect(resetButton).not.toHaveAttribute("title");
    const user = userEvent.setup();
    await user.hover(resetButton);
    const resetTooltip = await screen.findByRole("tooltip");
    expect(resetTooltip).toHaveTextContent("Reset credit expiration times:");
    expect(resetTooltip).toHaveTextContent("2026");
    const callsBadge = within(cards).getByText(/^Cycle \d/);
    expect(
      resetButton.compareDocumentPosition(callsBadge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    resetCredits = 4;
    fireEvent.click(resetButton);

    expect(await screen.findByText("Reset 4 times")).toBeInTheDocument();
    const updatedResetButton = within(cards).getByRole("button", { name: "Query reset credits" });
    expect(updatedResetButton).not.toHaveAttribute("title");
    expect(mocks.startStatusRefresh).toHaveBeenCalled();
    expect((await screen.findAllByText("FREE")).length).toBeGreaterThan(0);
    expect(screen.queryByText("PLUS")).not.toBeInTheDocument();

    await waitFor(() => {
      const raw = window.localStorage.getItem(AUTH_FILES_DATA_CACHE_KEY);
      expect(raw).toContain('"planType":"plus"');
      expect(raw).toContain('"resetCreditCount":4');
      expect(raw).not.toContain("resetCreditExpirations");
    });
  });

  test("cards view confirms before consuming a Codex reset credit", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      label: "Codex Main",
      account_type: "oauth",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
      plan_type: "plus",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota
      .mockResolvedValueOnce({
        items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
        planType: "plus",
        resetCreditCount: 3,
      })
      .mockResolvedValueOnce({
        items: [{ label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 }],
        planType: "plus",
        resetCreditCount: 2,
      });

    mocks.getStatus
      .mockResolvedValueOnce({
        items: [
          {
            auth_index: "1",
            plan_type: "plus",
            reset_credit_count: 3,
            quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 12 }],
          },
        ],
      })
      .mockResolvedValue({
        items: [
          {
            auth_index: "1",
            plan_type: "plus",
            reset_credit_count: 2,
            quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 12 }],
          },
        ],
      });
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "plus",
            resetCreditCount: 3,
            items: [{ label: "m_quota.code_5h", percent: 20, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Reset 3 times")).toBeInTheDocument();
    const cards = screen.getByTestId("auth-files-cards");
    fireEvent.click(within(cards).getByRole("button", { name: "Reset quota" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Reset quota?")).toBeInTheDocument();
    expect(mocks.consumeCodexResetCredit).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Reset quota" }));

    await waitFor(() => expect(mocks.consumeCodexResetCredit).toHaveBeenCalledTimes(1));
    expect(mocks.consumeCodexResetCredit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "codex.json" }),
    );
    expect(await screen.findByText("Reset 2 times")).toBeInTheDocument();
    expect(mocks.startStatusRefresh).toHaveBeenCalled();
  });

  test("cards view uses current auth-file plan badge instead of stale cached quota plan", async () => {
    const now = Date.now();
    const currentFile = {
      name: "codex.json",
      label: "Codex Main",
      account_type: "oauth",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
      plan_type: "free",
    } as any;

    mocks.list.mockImplementation(async () => ({ files: [currentFile] }));
    mocks.fetchQuota.mockImplementation(() => new Promise(() => {}));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [currentFile],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            planType: "plus",
            items: [{ label: "m_quota.code_5h", percent: 20, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
    expect(screen.queryByText("PLUS")).not.toBeInTheDocument();
  });

  test("cards view exposes quota refresh for Anthropic OAuth files", async () => {
    const now = Date.now();
    const file = {
      name: "claude-oauth.json",
      label: "Claude Pro",
      account_type: "oauth",
      type: "claude",
      provider: "anthropic",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "claude-1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockResolvedValue({
      items: [{ label: "claude_quota.five_hour", percent: 88, resetAtMs: now + 60_000 }],
    });

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: { source: [], auth_index: [] },
        quotaByFileName: {
          "claude-oauth.json": {
            status: "success",
            updatedAt: now,
            items: [{ label: "claude_quota.five_hour", percent: 72, resetAtMs: now + 30_000 }],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Claude Pro")).toBeInTheDocument();
    const refreshButton = within(screen.getByTestId("auth-files-cards")).getByRole("button", {
      name: "Refresh",
    });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalledWith(
        expect.objectContaining({ auth_indexes: ["claude-1"], force: true }),
        expect.anything(),
      );
    });
  });

  test("cards view shows inline error when quota fetch fails", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.fetchQuota.mockRejectedValue(new Error("request_failed"));

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("codex.json")).toBeInTheDocument();
    expect(screen.getByTestId("auth-files-cards")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("auth-files-cards")).getByRole("button", { name: "Refresh" }),
    );
    const errorBadge = await screen.findByTestId("auth-file-quota-error-badge");
    expect(errorBadge).toHaveTextContent("Error");
    fireEvent.mouseEnter(errorBadge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Request failed");
  });

  test("group overview summarizes current filtered results from shared quota state", async () => {
    const now = Date.now();
    const file = {
      name: "codex.json",
      type: "codex",
      size: 1024,
      modified: now,
      disabled: false,
      auth_index: "1",
    } as any;

    mocks.list.mockImplementationOnce(async () => ({ files: [file] }));
    mocks.getEntityStats.mockImplementationOnce(
      async () =>
        ({
          source: [],
          auth_index: [
            { entity_name: "1", requests: 9, failed: 2, avg_latency: 0, total_tokens: 0 },
          ],
        }) as any,
    );

    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    window.localStorage.setItem(
      AUTH_FILES_DATA_CACHE_KEY,
      JSON.stringify({
        savedAtMs: now,
        files: [file],
        usageData: null,
        quotaByFileName: {
          "codex.json": {
            status: "success",
            updatedAt: now,
            items: [
              { label: "m_quota.code_5h", percent: 12, resetAtMs: now + 60_000 },
              { label: "m_quota.code_weekly", percent: 34, resetAtMs: now + 120_000 },
            ],
          },
        },
      }),
    );

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Group overview" }));

    expect(await screen.findByText("Channel Group Overview")).toBeInTheDocument();
    expect(screen.getAllByText("Current results").length).toBeGreaterThan(0);
    expect(screen.getByText("chart")).toBeInTheDocument();
  });

  test("runtime-only cards do not render a selection checkbox", async () => {
    const now = Date.now();
    mocks.list.mockImplementationOnce(async () => ({
      files: [
        {
          name: "gemini-runtime",
          label: "Gemini Runtime",
          type: "gemini-cli",
          runtime_only: true,
          size: 1024,
          modified: now,
          disabled: false,
        },
      ],
    }));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();
    expect(screen.queryByLabelText("Select Gemini Runtime")).not.toBeInTheDocument();
  });

  test("cards view keeps selection checkbox usable after deselect", async () => {
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));

    render(
      <MemoryRouter initialEntries={["/auth-files"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId("auth-files-cards")).toBeInTheDocument();

    const checkbox = screen.getByLabelText("Select qwen.json") as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.parentElement).not.toHaveClass("opacity-0");
    expect(checkbox.parentElement).not.toHaveClass("pointer-events-none");
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);

    expect(screen.getByLabelText("Select qwen.json")).toBeInTheDocument();
    expect((screen.getByLabelText("Select qwen.json") as HTMLInputElement).checked).toBe(false);
  });
});
