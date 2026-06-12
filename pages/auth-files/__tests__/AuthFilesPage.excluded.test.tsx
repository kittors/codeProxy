import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<{ files: any[] }> => ({ files: [] })),
  getOauthExcludedModels: vi.fn(async () => ({})),
  replaceOauthExcludedModels: vi.fn(async () => ({})),
  getOauthModelAlias: vi.fn(async () => ({})),
  getModelConfigs: vi.fn(async () => []),
  getModelOwnerPresets: vi.fn(async () => []),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  getUsage: vi.fn(async () => ({ apis: {} })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: {
      ...mod.authFilesApi,
      list: mocks.list,
      getOauthExcludedModels: mocks.getOauthExcludedModels,
      replaceOauthExcludedModels: mocks.replaceOauthExcludedModels,
      getOauthModelAlias: mocks.getOauthModelAlias,
    },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
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

async function openExcludedConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Auth config" }));
  return screen.findByRole("dialog", { name: "OAuth Excluded Models" });
}

async function closeDialog(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole("button", { name: "close" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "OAuth Excluded Models" })).not.toBeInTheDocument();
  });
}

describe("AuthFilesPage OAuth excluded models", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.list.mockReset();
    mocks.list.mockResolvedValue({ files: [] });
    mocks.getOauthExcludedModels.mockReset();
    mocks.getOauthExcludedModels.mockResolvedValue({});
    mocks.replaceOauthExcludedModels.mockReset();
    mocks.replaceOauthExcludedModels.mockResolvedValue({});
    mocks.getOauthModelAlias.mockReset();
    mocks.getOauthModelAlias.mockResolvedValue({});
    mocks.getModelConfigs.mockReset();
    mocks.getModelConfigs.mockResolvedValue([]);
    mocks.getModelOwnerPresets.mockReset();
    mocks.getModelOwnerPresets.mockResolvedValue([]);
    mocks.getAuthGroupModelOwnerMappingMap.mockReset();
    mocks.getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
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

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));

    const firstDialog = await openExcludedConfig(user);
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1));

    await closeDialog(user, firstDialog);

    await openExcludedConfig(user);
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(2));
  });

  test("refetches auth files whenever the files tab is re-entered", async () => {
    const user = userEvent.setup();
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

    const dialog = await openExcludedConfig(user);
    await waitFor(() => expect(mocks.getOauthExcludedModels).toHaveBeenCalledTimes(1));

    await closeDialog(user, dialog);

    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("after.json")).toBeInTheDocument();
  });

  test("keeps excluded model edits local until the footer save button is clicked", async () => {
    const user = userEvent.setup();
    mocks.getOauthExcludedModels.mockResolvedValue({ codex: ["old-model"] });

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

    const dialog = await screen.findByRole("dialog", { name: "OAuth Excluded Models" });
    const textarea = await within(dialog).findByRole("textbox", {
      name: "codex OAuth Excluded Models",
    });

    await user.clear(textarea);
    await user.type(textarea, "new-model");

    expect(mocks.replaceOauthExcludedModels).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "OAuth Excluded Models" }),
      ).not.toBeInTheDocument();
    });
    expect(mocks.replaceOauthExcludedModels).not.toHaveBeenCalled();

    const reopenedDialog = await openExcludedConfig(user);
    const reopenedTextarea = await within(reopenedDialog).findByRole("textbox", {
      name: "codex OAuth Excluded Models",
    });
    await user.clear(reopenedTextarea);
    await user.type(reopenedTextarea, "new-model");
    await user.click(within(reopenedDialog).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(mocks.replaceOauthExcludedModels).toHaveBeenCalledWith({ codex: ["new-model"] });
    });
  });
});
