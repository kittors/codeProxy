import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<{ files: any[] }> => ({ files: [] })),
  getOauthExcludedModels: vi.fn(async () => ({})),
  getOauthModelAlias: vi.fn(async () => ({})),
  getModelConfigs: vi.fn(async () => []),
  getModelOwnerPresets: vi.fn(async () => []),
  getUsage: vi.fn(async () => ({ apis: {} })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      getOauthExcludedModels: mocks.getOauthExcludedModels,
      getOauthModelAlias: mocks.getOauthModelAlias,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
    },
    usageApi: { ...mod.usageApi, getUsage: mocks.getUsage, getEntityStats: mocks.getEntityStats },
    oauthApi: {
      ...mod.oauthApi,
      startAuth: vi.fn(async () => ({ url: "", state: "" })),
      getAuthStatus: vi.fn(async () => ({ status: "waiting" })),
      submitCallback: vi.fn(async () => ({})),
      iflowCookieAuth: vi.fn(async () => ({ status: "ok" })),
    },
    vertexApi: { ...mod.vertexApi, importCredential: vi.fn(async () => ({})) },
  };
});

describe("AuthFilesPage OAuth excluded models", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ files: [] });
    mocks.getOauthExcludedModels.mockReset();
    mocks.getOauthExcludedModels.mockResolvedValue({});
    mocks.getOauthModelAlias.mockReset();
    mocks.getOauthModelAlias.mockResolvedValue({});
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockResolvedValue([]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockResolvedValue([]);
    mocks.getUsage.mockReset();
    mocks.getUsage.mockResolvedValue({ apis: {} });
    mocks.getEntityStats.mockReset();
    mocks.getEntityStats.mockResolvedValue({ source: [], auth_index: [] });
  });

  test("does not refetch endlessly when excluded models map is empty", async () => {
    render(
      <MemoryRouter initialEntries={["/auth-files?tab=excluded"]}>
        <ThemeProvider>
          <ToastProvider>
            <Routes>
              <Route path="/auth-files" element={<AuthFilesPage />} />
            </Routes>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("No config")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 30));
    expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1);
  });

  test("refetches excluded models whenever the excluded tab is entered", async () => {
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

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "OAuth Excluded Models" }));
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute(
      "aria-selected",
      "true",
    ));

    fireEvent.click(screen.getByRole("tab", { name: "OAuth Excluded Models" }));
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(2));
  });

  test("refetches auth files whenever the files tab is re-entered", async () => {
    mocks.list
      .mockResolvedValueOnce({
        files: [{ name: "before.json", type: "codex", size: 1, modified: Date.now() }] as any[],
      })
      .mockResolvedValue({
        files: [{ name: "after.json", type: "codex", size: 1, modified: Date.now() }] as any[],
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

    expect(await screen.findByText("before.json")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "OAuth Excluded Models" }));
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("after.json")).toBeInTheDocument();
  });
});
