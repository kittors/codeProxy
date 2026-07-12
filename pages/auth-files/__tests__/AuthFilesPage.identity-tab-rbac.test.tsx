import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider, ThemeProvider } from "@code-proxy/ui";
import type { AuthFileItem, IdentityFingerprintAccountDetail } from "@code-proxy/api-client";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import i18n from "@code-proxy/i18n";

const mocks = vi.hoisted(() => ({
  can: vi.fn((permission: string) => permission === "auth_files.read"),
  list: vi.fn(async (): Promise<{ files: AuthFileItem[] }> => ({ files: [] })),
  downloadText: vi.fn(async () => "{}"),
  getAccountDetail: vi.fn(async (): Promise<IdentityFingerprintAccountDetail> => {
    throw new Error("not mocked");
  }),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  getAuthFileTrend: vi.fn(async (authIndex: string) => ({
    auth_index: authIndex,
    days: 7,
    hours: 5,
    request_total: 1,
    cycle_request_total: 1,
    cycle_cost_total: 0,
    weekly_quota_used_percent: 0,
    cycle_known: false,
    daily_usage: [],
    hourly_usage: [],
    quota_series: [],
  })),
  getAuthFileGroupTrend: vi.fn(async () => ({
    days: 7,
    group: "all",
    points: [],
  })),
  getModelConfigs: vi.fn(async () => []),
  getModelOwnerPresets: vi.fn(async () => []),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
}));

vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: mocks.can,
    state: {
      principal: {
        platform_admin: false,
        effective_tenant: {
          id: "tenant-potato",
          type: "standard",
          name: "potato",
        },
      },
    },
    actions: {},
  }),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      downloadText: mocks.downloadText,
    },
    identityFingerprintApi: {
      ...mod.identityFingerprintApi,
      getAccountDetail: mocks.getAccountDetail,
    },
    usageApi: {
      ...mod.usageApi,
      getEntityStats: mocks.getEntityStats,
      getAuthFileTrend: mocks.getAuthFileTrend,
      getAuthFileGroupTrend: mocks.getAuthFileGroupTrend,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
    },
  };
});

vi.mock("@code-proxy/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui")>()),
  EChart: ({ className }: { className?: string }) => <div className={className}>chart</div>,
}));

const codexIdentityDetail: IdentityFingerprintAccountDetail = {
  summary: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    primary_source: "learned",
    learned: true,
    learned_fields: 3,
    effective_fields: 3,
    source_counts: { learned: 3 },
    client_product: "codex_cli_rs",
    client_variant: "CLI",
    version: "0.125.0",
  },
  effective: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    auth_subject_id: "authsub_codex_terminal",
    enabled: true,
    fields: {
      "user-agent": { value: "codex_cli_rs/0.125.0", source: "learned" },
    },
  },
  learned: {
    provider: "codex",
    account_key: "authsub_codex_terminal",
    auth_subject_id: "authsub_codex_terminal",
    fields: { "user-agent": "codex_cli_rs/0.125.0" },
    observed_headers: {},
    created_at: "2026-07-10T08:00:00Z",
    updated_at: "2026-07-10T08:30:00Z",
    last_seen_at: "2026-07-10T08:30:00Z",
  },
  preset: {},
  builtin_default: {},
};

describe("AuthFilesPage identity tab RBAC", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("table"));
    window.localStorage.setItem("authFilesPage.quotaAutoRefreshMs.v1", JSON.stringify(0));
    mocks.can.mockReset();
    mocks.can.mockImplementation((permission: string) => permission === "auth_files.read");
    mocks.list.mockReset();
    mocks.list.mockImplementation(async () => ({
      files: [
        {
          name: "codex-oauth.json",
          label: "Codex OAuth",
          type: "codex",
          provider: "codex",
          account_type: "oauth",
          auth_index: "codex-oauth-1",
          size: 1024,
          modified: Date.now(),
          disabled: false,
          identity_fingerprint_summary: codexIdentityDetail.summary,
        },
      ],
    }));
    mocks.downloadText.mockReset();
    mocks.downloadText.mockResolvedValue("{}");
    mocks.getAccountDetail.mockReset();
    mocks.getAccountDetail.mockResolvedValue(codexIdentityDetail);
    mocks.getEntityStats.mockReset();
    mocks.getEntityStats.mockResolvedValue({ source: [], auth_index: [] });
    mocks.getAuthFileTrend.mockReset();
    mocks.getAuthFileTrend.mockImplementation(async (authIndex: string) => ({
      auth_index: authIndex,
      days: 7,
      hours: 5,
      request_total: 1,
      cycle_request_total: 1,
      cycle_cost_total: 0,
      weekly_quota_used_percent: 0,
      cycle_known: false,
      daily_usage: [],
      hourly_usage: [],
      quota_series: [],
    }));
    mocks.getAuthFileGroupTrend.mockReset();
    mocks.getAuthFileGroupTrend.mockResolvedValue({ days: 7, group: "all", points: [] });
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockResolvedValue([]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockResolvedValue([]);
    mocks.getAuthGroupModelOwnerMappingMap.mockReset();
    mocks.getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  test("shows Identity tab for tenant users with auth_files.read only", async () => {
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

    expect(await screen.findByText("Codex OAuth")).toBeInTheDocument();
    // Tenant principal must not be gated on platform system.config.read.
    expect(mocks.can).toHaveBeenCalledWith("auth_files.read");
    expect(mocks.can).not.toHaveBeenCalledWith("system.config.read");

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    const identityTab = await screen.findByRole("tab", { name: /Identity|身份/i });
    expect(identityTab).toBeInTheDocument();
    fireEvent.click(identityTab);

    await waitFor(() => {
      expect(mocks.getAccountDetail).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "codex",
          account_key: "authsub_codex_terminal",
        }),
      );
    });
    expect(await screen.findByTestId("auth-file-identity-fingerprint")).toBeInTheDocument();
  });

  test("hides Identity tab when auth_files.read is missing", async () => {
    mocks.can.mockImplementation(() => false);

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

    expect(await screen.findByText("Codex OAuth")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    await screen.findByRole("tab", { name: /Fields|字段/i });
    expect(screen.queryByRole("tab", { name: /Identity|身份/i })).not.toBeInTheDocument();
    expect(mocks.getAccountDetail).not.toHaveBeenCalled();
  });
});
