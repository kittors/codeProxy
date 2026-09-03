import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import i18n from "@code-proxy/i18n";
import { AuthFilesPage } from "../AuthFilesPage";
import type { AuthFileItem, EntityStatsResponse } from "@code-proxy/api-client";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ files: AuthFileItem[] }>>(async () => ({
    files: [
      {
        name: "pcamtu927@gmail.com.json",
        type: "gemini",
        size: 1024,
        modified: Date.now(),
        disabled: false,
        email: "pcamtu927@gmail.com",
      },
    ],
  })),
  getEntityStats: vi.fn<() => Promise<EntityStatsResponse>>(async () => ({
    source: [],
    auth_index: [],
  })),
  getAuthFileTrend: vi.fn(async () => ({
    auth_index: "index-1",
    days: 7,
    hours: 5,
    request_total: 0,
    cycle_request_total: 0,
    cycle_cost_total: 0,
    cycle_total_tokens: 0,
    weekly_quota_used_percent: 0,
    cycle_known: false,
    cycle_start: "",
    daily_usage: [],
    hourly_usage: [],
    quota_series: [],
  })),
  getUsageLogs: vi.fn(async () => ({ items: [], total: 0, page: 1, size: 200 })),
  fetchQuota: vi.fn(() => new Promise(() => {})),
  getStatus: vi.fn(async () => ({ items: [] as Array<Record<string, unknown>> })),
  startStatusRefresh: vi.fn(async () => ({ job_id: "job-1", accepted: 0, deduplicated: 0 })),
  getStatusRefreshJob: vi.fn(async () => ({ job_id: "job-1", state: "completed", total: 0, completed: 0, failed: 0, results: [] })),
  listProxies: vi.fn(async () => []),
  getModelConfigs: vi.fn(async () => []),
  getModelOwnerPresets: vi.fn(async () => []),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  reconcile: vi.fn(async () => ({})),
  clearStatus: vi.fn(async () => ({})),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: () => true,
    state: {
      principal: {
        platform_admin: true,
        effective_tenant: {
          id: "system",
          type: "system",
          name: "System",
        },
      },
    },
  }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...actual,
    authFilesApi: {
      ...actual.authFilesApi,
      list: mocks.list,
      deleteFile: vi.fn(async () => ({})),
      toggleStatus: vi.fn(async () => ({})),
      downloadText: vi.fn(async () => "{}"),
      patchFields: vi.fn(async () => ({})),
      getModelsForAuthFile: vi.fn(async () => ({ models: [], source: "upstream" })),
      upload: vi.fn(async () => ({})),
    },
    quotaApi: {
      reconcile: mocks.reconcile,
      clearStatus: mocks.clearStatus,
    },
    modelsApi: {
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
      saveAuthGroupModelOwnerMapping: vi.fn(async () => undefined),
    },
    usageApi: {
      ...actual.usageApi,
      getEntityStats: mocks.getEntityStats,
      getAuthFileTrend: mocks.getAuthFileTrend,
      getUsageLogs: mocks.getUsageLogs,
      getAuthFileGroupTrend: vi.fn(async () => ({ days: 7, group: "all", points: [], quota_points: [], quota_series: [] })),
      recordAuthFileQuotaSnapshot: vi.fn(async () => ({})),
    },
    aiAccountsStatusApi: {
      getStatus: mocks.getStatus,
      startStatusRefresh: mocks.startStatusRefresh,
      getStatusRefreshJob: mocks.getStatusRefreshJob,
    },
  };
});

vi.mock("@code-proxy/api-client/endpoints/proxies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@code-proxy/api-client/endpoints/proxies")>();
  return {
    ...actual,
    proxiesApi: {
      ...actual.proxiesApi,
      list: mocks.listProxies,
    },
  };
});

vi.mock("@features/quota-preview/quota-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@features/quota-preview/quota-fetch")>();
  return {
    ...actual,
    fetchQuota: mocks.fetchQuota,
    consumeCodexResetCredit: vi.fn(async () => undefined),
  };
});

describe("AuthFilesPage masking toggle", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    await i18n.changeLanguage("zh-CN");
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({
      files: [
        {
          name: "pcamtu927@gmail.com",
          type: "codex",
          account_type: "oauth",
          channel_name: "pcamtu927@gmail.com",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          email: "pcamtu927@gmail.com",
        },
      ],
    });
    mocks.getStatus.mockReset();
    mocks.getStatus.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("masks card and table titles when toggle button is clicked", async () => {
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

    // Initial card view: plaintext email title
    await waitFor(() => {
      expect(screen.getByText("pcamtu927@gmail.com")).toBeInTheDocument();
    });

    // Click toggle button to mask
    const toggleButton = screen.getByRole("button", { name: "开启数据脱敏" });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(screen.getByText("pc***27@gmail.com")).toBeInTheDocument();
      expect(screen.queryByText("pcamtu927@gmail.com")).not.toBeInTheDocument();
    });

    // Switch to list view (table)
    const listViewTab = screen.getByRole("tab", { name: "列表" });
    await user.click(listViewTab);

    await waitFor(() => {
      expect(screen.getByText("pc***27@gmail.com")).toBeInTheDocument();
      expect(screen.queryByText("pcamtu927@gmail.com")).not.toBeInTheDocument();
    });

    // Unmask
    const unmaskButton = screen.getByRole("button", { name: "关闭数据脱敏" });
    await user.click(unmaskButton);

    await waitFor(() => {
      expect(screen.getByText("pcamtu927@gmail.com")).toBeInTheDocument();
    });
  });
});
