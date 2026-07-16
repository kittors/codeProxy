import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AuthFileItem } from "@code-proxy/api-client";
import { ApiError } from "@code-proxy/api-client";
import {
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  setActiveCacheTenantId,
  DEFAULT_CACHE_TENANT_ID,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import { useAuthFilesStatusState } from "../useAuthFilesStatusState";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startStatusRefresh: vi.fn(),
  getStatusRefreshJob: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    aiAccountsStatusApi: {
      getStatus: mocks.getStatus,
      startStatusRefresh: mocks.startStatusRefresh,
      getStatusRefreshJob: mocks.getStatusRefreshJob,
    },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/ui")>();
  return {
    ...mod,
    useToast: () => ({ notify: mocks.notify }),
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const files: AuthFileItem[] = [
  {
    name: "a.json",
    type: "codex",
    auth_index: "a1",
    auth_subject_id: "sub-a",
    size: 1,
    modified: Date.now(),
    disabled: false,
  },
  {
    name: "b.json",
    type: "codex",
    auth_index: "b1",
    auth_subject_id: "sub-b",
    size: 1,
    modified: Date.now(),
    disabled: false,
  },
];

const twinSubjectFiles: AuthFileItem[] = [
  {
    name: "twin-1.json",
    type: "codex",
    auth_index: "idx-1",
    auth_subject_id: "shared-sub",
    size: 1,
    modified: Date.now(),
    disabled: false,
  },
  {
    name: "twin-2.json",
    type: "codex",
    auth_index: "idx-2",
    auth_subject_id: "shared-sub",
    size: 1,
    modified: Date.now(),
    disabled: false,
  },
];

describe("useAuthFilesStatusState batch refresh", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    mocks.getStatus.mockReset();
    mocks.startStatusRefresh.mockReset();
    mocks.getStatusRefreshJob.mockReset();
    mocks.notify.mockReset();
    mocks.getStatus.mockResolvedValue({
      items: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 10 }],
          usage: {
            cycle_request_total: 1,
            cycle_known: true,
            request_total_30d: 10,
            success_total_30d: 9,
            failure_total_30d: 1,
          },
          upstream_checked_at: "2026-07-16T00:00:00Z",
        },
        {
          auth_index: "b1",
          auth_subject_id: "sub-b",
          quotas: [{ quota_key: "code_5h", quota_label: "m_quota.code_5h", percent: 20 }],
          usage: {
            cycle_request_total: 2,
            cycle_known: true,
            request_total_30d: 20,
            success_total_30d: 18,
            failure_total_30d: 2,
          },
          upstream_checked_at: "2026-07-16T00:00:00Z",
        },
      ],
    });
    mocks.startStatusRefresh.mockResolvedValue({
      job_id: "job-1",
      accepted: 2,
      deduplicated: 0,
    });
    mocks.getStatusRefreshJob.mockResolvedValue({
      job_id: "job-1",
      state: "completed",
      total: 2,
      completed: 2,
      failed: 0,
      results: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          state: "success",
          result: {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            quotas: [{ quota_key: "code_5h", percent: 70 }],
            usage: { cycle_request_total: 7, cycle_known: true, request_total_30d: 70 },
          },
        },
        {
          auth_index: "b1",
          auth_subject_id: "sub-b",
          state: "success",
          result: {
            auth_index: "b1",
            auth_subject_id: "sub-b",
            quotas: [{ quota_key: "code_5h", percent: 80 }],
            usage: { cycle_request_total: 8, cycle_known: true, request_total_30d: 80 },
          },
        },
      ],
    });
  });

  test("page open loads one status snapshot then quietly probes visible cards", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    expect(mocks.startStatusRefresh).toHaveBeenCalledWith(
      { auth_indexes: ["a1", "b1"], force: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test("forceRefreshPage posts one batch job then polls once and reloads snapshot", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const setUsageData = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
        setUsageDataFromStatus: setUsageData,
      }),
    );

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    mocks.getStatus.mockClear();
    mocks.startStatusRefresh.mockClear();
    mocks.getStatusRefreshJob.mockClear();
    mocks.getStatus.mockResolvedValue({
      items: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          quotas: [{ quota_key: "code_5h", percent: 70 }],
          usage: { cycle_request_total: 7, cycle_known: true, request_total_30d: 70 },
        },
        {
          auth_index: "b1",
          auth_subject_id: "sub-b",
          quotas: [{ quota_key: "code_5h", percent: 80 }],
          usage: { cycle_request_total: 8, cycle_known: true, request_total_30d: 80 },
        },
      ],
    });

    await act(async () => {
      await result.current.forceRefreshPage();
    });

    expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.startStatusRefresh).toHaveBeenCalledWith(
      { auth_indexes: ["a1", "b1"], force: true },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(mocks.getStatusRefreshJob).toHaveBeenCalledTimes(1);
    expect(mocks.getStatus).toHaveBeenCalledTimes(1);
    expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(70);
    expect(result.current.callsByAuthIndex.a1).toBe(7);
  });

  test("same auth_subject_id fans status onto both files", async () => {
    const setUsageData = vi.fn();
    mocks.getStatus.mockResolvedValue({
      items: [
        {
          auth_index: "idx-1",
          auth_subject_id: "shared-sub",
          quotas: [{ quota_key: "code_5h", percent: 33 }],
          usage: {
            cycle_request_total: 5,
            cycle_known: true,
            request_total_30d: 50,
            success_total_30d: 40,
            failure_total_30d: 10,
            cycle_cost_total: 1.5,
            weekly_quota_used_percent: 20,
          },
        },
      ],
    });
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: twinSubjectFiles,
        loading: false,
        setFiles,
        setDetailFile,
        setUsageDataFromStatus: setUsageData,
      }),
    );

    await waitFor(() => {
      expect(result.current.quotaByFileName["twin-1.json"]?.items[0]?.percent).toBe(33);
      expect(result.current.quotaByFileName["twin-2.json"]?.items[0]?.percent).toBe(33);
      // cycle/budget must fan to every real auth_index of the subject, not only canonical.
      expect(result.current.callsByAuthIndex["idx-1"]).toBe(5);
      expect(result.current.callsByAuthIndex["idx-2"]).toBe(5);
      expect(result.current.cycleBudgetByAuthIndex["idx-2"]?.cycleCostTotal).toBe(1.5);
    });
    await waitFor(() => {
      expect(setUsageData).toHaveBeenCalled();
      const updater = setUsageData.mock.calls.at(-1)?.[0];
      expect(typeof updater).toBe("function");
      const next =
        typeof updater === "function"
          ? updater({ source: [], auth_index: [] })
          : updater;
      const names = (next?.auth_index ?? []).map(
        (point: { entity_name: string }) => point.entity_name,
      );
      expect(names).toEqual(expect.arrayContaining(["idx-1", "idx-2"]));
    });
  });

  test("job poll 404 does not mark status API unsupported", async () => {
    mocks.getStatusRefreshJob.mockRejectedValue(
      new ApiError({ message: "gone", status: 404 }),
    );
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    mocks.getStatus.mockClear();

    await act(async () => {
      await result.current.forceRefreshPage();
    });

    expect(result.current.statusApiSupported).toBe(true);
    expect(mocks.getStatus).toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({ message: "auth_files.status_refresh_job_lost" }),
    );
  });

  test("status GET 404 marks unsupported and never starts refresh", async () => {
    mocks.getStatus.mockRejectedValue(new ApiError({ message: "missing", status: 404 }));
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );

    await waitFor(() => expect(result.current.statusApiSupported).toBe(false));
    await act(async () => {
      await result.current.forceRefreshPage();
    });
    expect(mocks.startStatusRefresh).not.toHaveBeenCalled();
  });

  test("tenant switch aborts in-flight job so old result cannot paint 99%", async () => {
    let resolveJob!: (value: unknown) => void;
    mocks.getStatusRefreshJob.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveJob = resolve;
        }),
    );
    // Tenant-b snapshot must not look like the poisoned 99% result.
    mocks.getStatus.mockImplementation(async () => ({
      items: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          quotas: [{ quota_key: "code_5h", percent: 10 }],
        },
      ],
    }));
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result, rerender } = renderHook(
      ({ tenant }: { tenant: string }) => {
        setActiveCacheTenantId(tenant);
        return useAuthFilesStatusState({
          tab: "files",
          pageItems: files,
          loading: false,
          setFiles,
          setDetailFile,
        });
      },
      { initialProps: { tenant: "tenant-a" } },
    );

    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await act(async () => {
      void result.current.forceRefreshPage();
    });
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());

    await act(async () => {
      rerender({ tenant: "tenant-b" });
    });

    resolveJob({
      job_id: "job-1",
      state: "completed",
      total: 2,
      completed: 2,
      failed: 0,
      results: [
        {
          auth_index: "a1",
          state: "success",
          result: {
            auth_index: "a1",
            quotas: [{ quota_key: "code_5h", percent: 99 }],
          },
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Poisoned progressive result from tenant-a job must not win.
    expect(result.current.quotaByFileName["a.json"]?.items?.[0]?.percent).not.toBe(99);
  });

  test("migrates legacy auto-refresh localStorage immediately", () => {
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(10000));
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    expect(result.current.quotaAutoRefreshMs).toBe(60_000);
    expect(JSON.parse(window.localStorage.getItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY) ?? "null")).toBe(
      60_000,
    );
  });

  test("visible-scope status GET requests only current auth indexes", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    const args = mocks.getStatus.mock.calls[0]?.[0] as
      | { authIndexes?: string[] }
      | undefined;
    expect(args?.authIndexes?.sort()).toEqual(["a1", "b1"]);
  });

  test("empty visible scope skips status GET; non-empty later fires one filtered GET", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { rerender } = renderHook(
      ({ pageItems }: { pageItems: AuthFileItem[] }) =>
        useAuthFilesStatusState({
          tab: "files",
          pageItems,
          loading: false,
          setFiles,
          setDetailFile,
        }),
      { initialProps: { pageItems: [] as AuthFileItem[] } },
    );

    // Empty page / filter: never hit unfiltered whole-tenant status.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getStatus).not.toHaveBeenCalled();

    rerender({ pageItems: files });
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalledTimes(1));
    const args = mocks.getStatus.mock.calls[0]?.[0] as
      | { authIndexes?: string[] }
      | undefined;
    expect(args?.authIndexes?.sort()).toEqual(["a1", "b1"]);
  });

  test("same-scope pageItems identity change after abort restarts status GET", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    let resolveFirst!: (value: unknown) => void;
    let getStatusCalls = 0;
    mocks.getStatus.mockImplementation(async (options?: { signal?: AbortSignal }) => {
      getStatusCalls += 1;
      if (getStatusCalls === 1) {
        return await new Promise((resolve, reject) => {
          resolveFirst = resolve;
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      }
      return {
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            quotas: [{ quota_key: "code_5h", percent: 61 }],
          },
          {
            auth_index: "b1",
            auth_subject_id: "sub-b",
            quotas: [{ quota_key: "code_5h", percent: 62 }],
          },
        ],
      };
    });

    const { result, rerender } = renderHook(
      ({ pageItems }: { pageItems: AuthFileItem[] }) =>
        useAuthFilesStatusState({
          tab: "files",
          pageItems,
          loading: false,
          setFiles,
          setDetailFile,
        }),
      {
        // New array identity, same auth indexes / scope key.
        initialProps: { pageItems: [...files] },
      },
    );

    await waitFor(() => expect(getStatusCalls).toBe(1));

    // Same scope key (same auth indexes), different array identity → effect cleanup aborts.
    await act(async () => {
      rerender({ pageItems: [...files] });
    });

    // Aborted first request must not leave scope permanently skipped.
    // Restarted snapshot (+ optional quiet probe final GET) must still paint 61/62.
    await waitFor(() => expect(getStatusCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => {
      expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(61);
      expect(result.current.quotaByFileName["b.json"]?.items[0]?.percent).toBe(62);
    });

    // Completing the aborted first response later must not be required.
    await act(async () => {
      resolveFirst({
        items: [
          {
            auth_index: "a1",
            quotas: [{ quota_key: "code_5h", percent: 1 }],
          },
        ],
      });
    });
    expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(61);
  });

  test("concurrent finals: older delayed page snapshot cannot overwrite newer single result", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    let resolvePageSnapshot!: (value: unknown) => void;
    let resolveSingleSnapshot!: (value: unknown) => void;
    let hangFinals = false;
    let hungFinalCalls = 0;
    mocks.getStatus.mockImplementation(async () => {
      if (!hangFinals) {
        return {
          items: [
            {
              auth_index: "a1",
              auth_subject_id: "sub-a",
              version: 1,
              updated_at: "2026-07-16T10:00:00.000Z",
              quotas: [{ quota_key: "code_5h", percent: 1 }],
            },
            {
              auth_index: "b1",
              auth_subject_id: "sub-b",
              version: 1,
              updated_at: "2026-07-16T10:00:00.000Z",
              quotas: [{ quota_key: "code_5h", percent: 2 }],
            },
          ],
        };
      }
      hungFinalCalls += 1;
      if (hungFinalCalls === 1) {
        return await new Promise((resolve) => {
          resolvePageSnapshot = resolve;
        });
      }
      return await new Promise((resolve) => {
        resolveSingleSnapshot = resolve;
      });
    });
    mocks.startStatusRefresh.mockImplementation(async (payload?: { auth_indexes?: string[] }) => ({
      job_id: payload?.auth_indexes?.length === 1 ? "job-single" : "job-page",
      accepted: payload?.auth_indexes?.length ?? 0,
      deduplicated: 0,
    }));
    mocks.getStatusRefreshJob.mockImplementation(async (jobId: string) => ({
      job_id: jobId,
      state: "completed",
      total: jobId === "job-page" ? 2 : 1,
      completed: jobId === "job-page" ? 2 : 1,
      failed: 0,
      results:
        jobId === "job-page"
          ? [
              { auth_index: "a1", state: "success" },
              { auth_index: "b1", state: "success" },
            ]
          : [{ auth_index: "a1", state: "success" }],
    }));

    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    // Drain enter snapshot + quiet probe before page/single concurrency.
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalled());
    await waitFor(() => expect(result.current.refreshingPage).toBe(false));
    mocks.startStatusRefresh.mockClear();
    mocks.getStatusRefreshJob.mockClear();
    hangFinals = true;
    hungFinalCalls = 0;

    await act(async () => {
      void result.current.forceRefreshPage();
    });
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(1));
    await act(async () => {
      void result.current.refreshQuota(files[0]!, "codex");
    });
    await waitFor(() => expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(hungFinalCalls).toBeGreaterThanOrEqual(2));

    // Newer single result arrives first (version 5), then older page final (version 3 for a1).
    await act(async () => {
      resolveSingleSnapshot({
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            version: 5,
            updated_at: "2026-07-16T12:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 55 }],
          },
        ],
      });
    });
    await waitFor(() => {
      expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(55);
    });

    await act(async () => {
      resolvePageSnapshot({
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            version: 3,
            updated_at: "2026-07-16T11:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 11 }],
          },
          {
            auth_index: "b1",
            auth_subject_id: "sub-b",
            version: 3,
            updated_at: "2026-07-16T11:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 22 }],
          },
        ],
      });
    });

    await waitFor(() => {
      // stale page final must not clobber newer single for a1
      expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(55);
      // b1 still applies independently from page final
      expect(result.current.quotaByFileName["b.json"]?.items[0]?.percent).toBe(22);
      expect(result.current.quotaByFileName["a.json"]?.status).not.toBe("loading");
      expect(result.current.quotaByFileName["b.json"]?.status).not.toBe("loading");
    });
  });

  test("deduplicated progress keeps prior snapshot and does not mark account error", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    mocks.getStatus
      .mockResolvedValueOnce({
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            version: 2,
            updated_at: "2026-07-16T10:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 40 }],
          },
          {
            auth_index: "b1",
            auth_subject_id: "sub-b",
            version: 2,
            updated_at: "2026-07-16T10:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 50 }],
          },
        ],
      })
      .mockResolvedValue({
        // Final snapshot only refreshes accounts still pending / deduplicated.
        // b1 already failed in job progress; snapshot may omit it or keep prior.
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            version: 3,
            updated_at: "2026-07-16T11:00:00.000Z",
            quotas: [{ quota_key: "code_5h", percent: 40 }],
          },
        ],
      });
    mocks.startStatusRefresh.mockResolvedValue({
      job_id: "job-page",
      accepted: 2,
      deduplicated: 0,
    });
    // Authoritative shape: a1 singleflight-deduplicated (completed, not failed); b1 real error.
    mocks.getStatusRefreshJob.mockResolvedValue({
      job_id: "job-page",
      state: "completed",
      total: 2,
      completed: 2,
      failed: 1,
      results: [
        {
          auth_index: "a1",
          auth_subject_id: "sub-a",
          state: "error",
          error_code: "deduplicated",
          error_message: "refresh already in progress",
        },
        {
          auth_index: "b1",
          auth_subject_id: "sub-b",
          state: "error",
          error_code: "upstream_timeout",
          error_message: "upstream timeout",
        },
      ],
    });

    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    await waitFor(() => {
      expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(40);
    });

    await act(async () => {
      await result.current.forceRefreshPage();
    });

    // a1: deduplicated — prior value kept / final snapshot applied; never error red.
    expect(result.current.quotaByFileName["a.json"]?.status).not.toBe("error");
    expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(40);
    // b1: real error remains isolated.
    expect(result.current.quotaByFileName["b.json"]?.status).toBe("error");
    expect(result.current.quotaByFileName["b.json"]?.error).toMatch(/upstream timeout/);
  });

  test("final status GET failure clears loading without wiping prior snapshot", async () => {
    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    let failNextStatusGet = false;
    mocks.getStatus.mockImplementation(async () => {
      if (failNextStatusGet) {
        failNextStatusGet = false;
        throw new Error("snapshot_failed");
      }
      return {
        items: [
          {
            auth_index: "a1",
            auth_subject_id: "sub-a",
            quotas: [{ quota_key: "code_5h", percent: 41 }],
          },
          {
            auth_index: "b1",
            auth_subject_id: "sub-b",
            quotas: [{ quota_key: "code_5h", percent: 42 }],
          },
        ],
      };
    });
    mocks.startStatusRefresh.mockResolvedValue({
      job_id: "job-1",
      accepted: 2,
      deduplicated: 0,
    });
    mocks.getStatusRefreshJob.mockResolvedValue({
      job_id: "job-1",
      state: "completed",
      total: 2,
      completed: 2,
      failed: 0,
      results: [
        { auth_index: "a1", state: "success" },
        { auth_index: "b1", state: "success" },
      ],
    });

    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    await waitFor(() => {
      expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(41);
    });
    await waitFor(() => expect(result.current.refreshingPage).toBe(false));

    failNextStatusGet = true;
    await act(async () => {
      await result.current.forceRefreshPage();
    });

    expect(result.current.quotaByFileName["a.json"]?.items[0]?.percent).toBe(41);
    expect(result.current.quotaByFileName["a.json"]?.status).not.toBe("loading");
    expect(result.current.quotaByFileName["b.json"]?.status).not.toBe("loading");
  });

  test("single-card refresh does not abort page job", async () => {
    const jobIdsSeen: string[] = [];
    mocks.startStatusRefresh.mockImplementation(async (payload?: { auth_indexes?: string[] }) => {
      const jobId = payload?.auth_indexes?.length === 1 ? "job-single" : "job-page";
      return { job_id: jobId, accepted: payload?.auth_indexes?.length ?? 0, deduplicated: 0 };
    });
    mocks.getStatusRefreshJob.mockImplementation(async (jobId: string) => {
      jobIdsSeen.push(jobId);
      if (jobId === "job-page") {
        return {
          job_id: "job-page",
          state: "completed",
          total: 2,
          completed: 2,
          failed: 0,
          results: [
            {
              auth_index: "a1",
              state: "success",
              result: {
                auth_index: "a1",
                quotas: [{ quota_key: "code_5h", percent: 11 }],
              },
            },
            {
              auth_index: "b1",
              state: "success",
              result: {
                auth_index: "b1",
                quotas: [{ quota_key: "code_5h", percent: 22 }],
              },
            },
          ],
        };
      }
      return {
        job_id: "job-single",
        state: "completed",
        total: 1,
        completed: 1,
        failed: 0,
        results: [
          {
            auth_index: "a1",
            state: "success",
            result: {
              auth_index: "a1",
              quotas: [{ quota_key: "code_5h", percent: 55 }],
            },
          },
        ],
      };
    });

    const setFiles = vi.fn();
    const setDetailFile = vi.fn();
    const { result } = renderHook(() =>
      useAuthFilesStatusState({
        tab: "files",
        pageItems: files,
        loading: false,
        setFiles,
        setDetailFile,
      }),
    );
    await waitFor(() => expect(mocks.getStatus).toHaveBeenCalled());
    await waitFor(() => expect(result.current.refreshingPage).toBe(false));
    mocks.startStatusRefresh.mockClear();
    jobIdsSeen.length = 0;

    await act(async () => {
      const page = result.current.forceRefreshPage();
      const single = result.current.refreshQuota(files[0]!, "codex");
      await Promise.all([page, single]);
    });

    expect(mocks.startStatusRefresh).toHaveBeenCalledTimes(2);
    expect(jobIdsSeen).toContain("job-page");
    expect(jobIdsSeen).toContain("job-single");
  });
});
