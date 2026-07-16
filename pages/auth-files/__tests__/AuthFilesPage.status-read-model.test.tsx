import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import i18n from "@code-proxy/i18n";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] as AuthFileItem[] })),
  getStatus: vi.fn(async () => ({ items: [] as Array<Record<string, unknown>> })),
  startStatusRefresh: vi.fn(async () => ({
    job_id: "job-1",
    accepted: 0,
    deduplicated: 0,
  })),
  getStatusRefreshJob: vi.fn(async () => ({
    job_id: "job-1",
    state: "completed" as const,
    total: 0,
    completed: 0,
    failed: 0,
    results: [] as Array<Record<string, unknown>>,
  })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  getAuthFileTrend: vi.fn(async () => ({
    auth_index: "x",
    days: 7,
    hours: 5,
    request_total: 0,
    cycle_request_total: 0,
    cycle_cost_total: 0,
    weekly_quota_used_percent: null,
    cycle_known: true,
    cycle_start: "",
    daily_usage: [],
    hourly_usage: [],
    quota_series: [],
  })),
  recordAuthFileQuotaSnapshot: vi.fn(async () => ({})),
  reconcile: vi.fn(async () => ({})),
  fetchQuota: vi.fn(async () => ({ items: [] })),
  apiCall: vi.fn(async () => ({})),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      deleteFile: vi.fn(async () => ({})),
      downloadText: vi.fn(async () => "{}"),
      patchFields: vi.fn(async () => ({})),
      getModelsForAuthFile: vi.fn(async () => ({ models: [], source: "registry" })),
      upload: vi.fn(async () => ({})),
    },
    aiAccountsStatusApi: {
      getStatus: mocks.getStatus,
      startStatusRefresh: mocks.startStatusRefresh,
      getStatusRefreshJob: mocks.getStatusRefreshJob,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
      getAuthFileTrend: mocks.getAuthFileTrend,
      recordAuthFileQuotaSnapshot: mocks.recordAuthFileQuotaSnapshot,
      getAuthFileGroupTrend: vi.fn(async () => ({ days: 7, group: "all", points: [] })),
      getUsageLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 200 })),
    },
    quotaApi: {
      ...mod.quotaApi,
      reconcile: mocks.reconcile,
      clearStatus: vi.fn(async () => ({})),
    },
    apiCallApi: {
      ...mod.apiCallApi,
      call: mocks.apiCall,
    },
  };
});

vi.mock("@features/quota-preview/quota-fetch", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@features/quota-preview/quota-fetch")>();
  return {
    ...mod,
    fetchQuota: mocks.fetchQuota,
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

const sampleFiles: AuthFileItem[] = Array.from({ length: 5 }, (_, i) => ({
  name: `codex-${i + 1}.json`,
  type: "codex",
  auth_index: `auth-${i + 1}`,
  auth_subject_id: `sub-${i + 1}`,
  size: 1024,
  modified: Date.now(),
  disabled: false,
}));

describe("AuthFilesPage status read-model request shape", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(0));
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ files: sampleFiles });
    mocks.getStatus.mockReset();
    mocks.getStatus.mockResolvedValue({
      items: sampleFiles.map((file) => ({
        auth_index: String(file.auth_index),
        auth_subject_id: String(file.auth_subject_id),
        quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 50 }],
        usage: {
          cycle_request_total: 3,
          cycle_known: true,
          request_total_30d: 30,
          success_total_30d: 27,
          failure_total_30d: 3,
        },
        upstream_checked_at: "2026-07-16T00:00:00Z",
      })),
    });
    mocks.startStatusRefresh.mockReset();
    mocks.startStatusRefresh.mockImplementation(async (...args: unknown[]) => {
      const payload = args[0] as { auth_indexes?: string[] } | undefined;
      return {
        job_id: "job-1",
        accepted: payload?.auth_indexes?.length ?? 0,
        deduplicated: 0,
      };
    });
    mocks.getStatusRefreshJob.mockReset();
    mocks.getStatusRefreshJob.mockResolvedValue({
      job_id: "job-1",
      state: "completed",
      total: 5,
      completed: 5,
      failed: 0,
      results: sampleFiles.map((file) => ({
        auth_index: String(file.auth_index),
        auth_subject_id: String(file.auth_subject_id),
        state: "success",
        result: {
          auth_index: String(file.auth_index),
          auth_subject_id: String(file.auth_subject_id),
          quotas: [{ quota_key: "code_5h", percent: 60 }],
          usage: { cycle_request_total: 9, cycle_known: true, request_total_30d: 40 },
        },
      })),
    });
    mocks.getEntityStats.mockClear();
    mocks.getAuthFileTrend.mockClear();
    mocks.recordAuthFileQuotaSnapshot.mockClear();
    mocks.reconcile.mockClear();
    mocks.fetchQuota.mockClear();
    mocks.apiCall.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test("first paint: auth-files + status only; no entity-stats/api-call/trend/reconcile/snapshot/fetchQuota", async () => {
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
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));

    expect(mocks.getEntityStats).not.toHaveBeenCalled();
    expect(mocks.getAuthFileTrend).not.toHaveBeenCalled();
    expect(mocks.recordAuthFileQuotaSnapshot).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.fetchQuota).not.toHaveBeenCalled();
    expect(mocks.apiCall).not.toHaveBeenCalled();
    expect(mocks.startStatusRefresh).not.toHaveBeenCalled();
  });

  test("toolbar refresh: one POST + one job poll + one final status GET", async () => {
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
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    mocks.getStatus.mockClear();
    mocks.list.mockClear();

    fireEvent.click(screen.getAllByRole("button", { name: "Refresh" })[0]!);

    await waitFor(() => {
      expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1);
      expect(mocks.getStatusRefreshJob).toHaveBeenCalledTimes(1);
      expect(mocks.getStatus).toHaveBeenCalledTimes(1);
    });
    expect(mocks.fetchQuota).not.toHaveBeenCalled();
    expect(mocks.getEntityStats).not.toHaveBeenCalled();
    expect(mocks.getAuthFileTrend).not.toHaveBeenCalled();
  });

  test("legacy 10s auto-refresh migrates to 60s in localStorage", async () => {
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(10000));
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
    expect(
      JSON.parse(window.localStorage.getItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY) ?? "null"),
    ).toBe(60_000);
  });
});
