import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type { ProxyCheckResult, ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({
    files: [
      {
        name: "codex-auth.json",
        label: "Codex Auth",
        account_type: "oauth",
        type: "codex",
        size: 1024,
        modified: Date.now(),
        disabled: false,
      },
    ],
  })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  downloadText: vi.fn(async () => JSON.stringify({ type: "codex" })),
  upload: vi.fn(async () => ({})),
  getModelConfigs: vi.fn(async () => []),
  getModelOwnerPresets: vi.fn(async () => []),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  proxiesList: vi.fn<() => Promise<ProxyPoolEntry[]>>(async () => []),
  proxiesCheck: vi.fn<() => Promise<ProxyCheckResult>>(async () => ({ ok: true, latencyMs: 420 })),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      downloadText: mocks.downloadText,
      upload: mocks.upload,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
    },
    usageApi: { ...mod.usageApi, getEntityStats: mocks.getEntityStats },
  };
});

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: {
    list: mocks.proxiesList,
    check: mocks.proxiesCheck,
  },
}));

describe("AuthFilesPage proxy fields editor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.list.mockClear();
    mocks.getEntityStats.mockClear();
    mocks.downloadText.mockClear();
    mocks.upload.mockClear();
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockResolvedValue([]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockResolvedValue([]);
    mocks.getAuthGroupModelOwnerMappingMap.mockReset();
    mocks.getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
    mocks.proxiesList.mockReset();
    mocks.proxiesCheck.mockReset();
    mocks.proxiesList.mockResolvedValue([
      {
        id: "us-west",
        name: "US West",
        url: "socks5://user:pass@203.0.113.8:7893",
        enabled: true,
        description: "West edge auth",
      },
    ]);
    mocks.proxiesCheck.mockResolvedValue({ ok: true, latencyMs: 420 });
  });

  test("shows proxy protocol, IP, latency, and remark in the auth fields dropdown", async () => {
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

    expect(await screen.findByText("Codex Auth")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(await screen.findByRole("tab", { name: "Fields" }));

    const proxySelect = await screen.findByRole("combobox", { name: "proxy_id (proxy pool)" });
    await waitFor(() => expect(mocks.proxiesCheck).toHaveBeenCalledWith({ id: "us-west" }));

    await user.click(proxySelect);

    expect(await screen.findByText("SOCKS5")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.8:7893")).toBeInTheDocument();
    expect(screen.getByText(/420 ms/)).toBeInTheDocument();
    expect(screen.getByText("West edge auth")).toBeInTheDocument();
    expect(screen.queryByText(/user:pass/)).not.toBeInTheDocument();
  });
});
