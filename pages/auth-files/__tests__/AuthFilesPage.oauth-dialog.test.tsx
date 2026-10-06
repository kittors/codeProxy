import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type { AuthFileItem } from "@code-proxy/api-client";
import { writeAuthFilesUiState } from "@code-proxy/domain";
import type {
  ProxyCheckResult,
  ProxyPoolEntry,
} from "@code-proxy/api-client/endpoints/proxies";

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ files: AuthFileItem[] }>>(async () => ({
    files: [],
  })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  startAuth: vi.fn(async () => ({ url: "", state: "" })),
  getAuthStatus: vi.fn(async () => ({ status: "waiting" })),
  submitCallback: vi.fn(async () => ({})),
  iflowCookieAuth: vi.fn(async () => ({ status: "ok" })),
  importCredential: vi.fn(async () => ({})),
  getModelConfigs: vi.fn(async (): Promise<unknown[]> => []),
  getModelOwnerPresets: vi.fn(async (): Promise<unknown[]> => []),
  getAuthGroupModelOwnerMappingMap: vi.fn(async () => ({})),
  proxiesList: vi.fn<() => Promise<ProxyPoolEntry[]>>(async () => []),
  proxiesCheck: vi.fn<() => Promise<ProxyCheckResult>>(async () => ({
    ok: true,
    latencyMs: 88,
  })),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

// 提示条走 @code-proxy/ui 自己的 toast 仓库（ToastProvider.notify 也调用它）；
// 只替换 toast 本身，订阅接口保留原实现，Toaster 照常挂载。
vi.mock("@code-proxy/ui/feedback/toastStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/ui/feedback/toastStore")>()),
  toast: toastMocks,
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@code-proxy/api-client")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, list: mocks.list },
    modelsApi: {
      ...mod.modelsApi,
      getModelConfigs: mocks.getModelConfigs,
      getModelOwnerPresets: mocks.getModelOwnerPresets,
      getAuthGroupModelOwnerMappingMap: mocks.getAuthGroupModelOwnerMappingMap,
    },
    usageApi: { ...mod.usageApi, getEntityStats: mocks.getEntityStats },
    aiAccountsStatusApi: {
      getStatus: vi.fn(async () => ({ items: [] })),
      startStatusRefresh: vi.fn(async () => ({
        job_id: "job-1",
        accepted: 0,
        deduplicated: 0,
      })),
      getStatusRefreshJob: vi.fn(async () => ({
        job_id: "job-1",
        state: "completed",
        total: 0,
        completed: 0,
        failed: 0,
        results: [],
      })),
    },
    oauthApi: {
      ...mod.oauthApi,
      startAuth: mocks.startAuth,
      getAuthStatus: mocks.getAuthStatus,
      submitCallback: mocks.submitCallback,
      iflowCookieAuth: mocks.iflowCookieAuth,
    },
    vertexApi: { ...mod.vertexApi, importCredential: mocks.importCredential },
  };
});

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: {
    list: mocks.proxiesList,
    check: mocks.proxiesCheck,
  },
}));

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.list.mockReset();
  mocks.list.mockResolvedValue({ files: [] });
  mocks.getEntityStats.mockReset();
  mocks.getEntityStats.mockResolvedValue({ source: [], auth_index: [] });
  mocks.startAuth.mockReset();
  mocks.startAuth.mockResolvedValue({ url: "", state: "" });
  mocks.getAuthStatus.mockReset();
  mocks.getAuthStatus.mockResolvedValue({ status: "waiting" });
  mocks.submitCallback.mockReset();
  mocks.submitCallback.mockResolvedValue({});
  mocks.iflowCookieAuth.mockReset();
  mocks.iflowCookieAuth.mockResolvedValue({ status: "ok" });
  mocks.importCredential.mockReset();
  mocks.importCredential.mockResolvedValue({});
  mocks.getModelConfigs.mockReset();
  mocks.getModelConfigs.mockResolvedValue(Array<unknown>());
  mocks.getModelOwnerPresets.mockReset();
  mocks.getModelOwnerPresets.mockResolvedValue(Array<unknown>());
  mocks.getAuthGroupModelOwnerMappingMap.mockReset();
  mocks.getAuthGroupModelOwnerMappingMap.mockResolvedValue({});
  mocks.proxiesList.mockReset();
  mocks.proxiesCheck.mockReset();
  mocks.proxiesList.mockResolvedValue(Array<ProxyPoolEntry>());
  mocks.proxiesCheck.mockResolvedValue({ ok: true, latencyMs: 88 });
  toastMocks.success.mockReset();
  toastMocks.error.mockReset();
  toastMocks.info.mockReset();
  toastMocks.warning.mockReset();
});

const renderPage = () =>
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

const fakeWindow = () => {
  const pending = { opener: {}, closed: false, location: { href: "" }, close: vi.fn() };
  vi.spyOn(window, "open").mockImplementation(() => pending as unknown as Window);
  return pending;
};

describe("AuthFilesPage add-account dialog", () => {
  test("opens from the toolbar with every way to add an account", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Add AI account" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Add AI account" }));
    expect(dialog.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Codex",
      "Claude",
      "Gemini CLI",
      "Antigravity",
      "Grok",
      "iFlow",
      "Qwen",
      "Kimi",
      "Vertex AI",
      "Auth files",
    ]);
  });

  test("preselects the provider the list is filtered to", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    writeAuthFilesUiState({ tab: "files", filter: "claude", search: "", page: 1 });
    mocks.list.mockResolvedValue({
      files: [
        {
          name: "claude-a.json",
          type: "claude",
          size: 1024,
          modified: Date.now(),
          disabled: false,
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("claude-a.json")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add AI account" }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("tab", { name: "Claude" })).toHaveAttribute("aria-selected", "true");
  });

  test("names the new account, switches the list to it and closes on Done", async () => {
    const user = userEvent.setup();
    fakeWindow();
    const now = Date.now();
    const initialFile: AuthFileItem = {
      name: "qwen.json",
      type: "qwen",
      size: 1024,
      modified: now,
      disabled: false,
    };
    const xaiFile: AuthFileItem = {
      name: "xai-user.json",
      type: "xai",
      provider: "xai",
      account_type: "oauth",
      email: "user@example.com",
      auth_index: "xai-auth",
      size: 2048,
      modified: now + 1,
      disabled: false,
    };
    window.localStorage.setItem("authFilesPage.filesViewMode.v1", JSON.stringify("cards"));
    writeAuthFilesUiState({ tab: "files", filter: "qwen", search: "qwen", page: 1 });
    mocks.list
      .mockResolvedValueOnce({ files: [initialFile] })
      .mockResolvedValue({ files: [initialFile, xaiFile] });
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://auth.x.ai/oauth2/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback&state=xai-state",
      state: "xai-state",
    });
    mocks.getAuthStatus.mockResolvedValue({ status: "wait" });
    renderPage();

    expect(await screen.findByText("qwen.json")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add AI account" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("tab", { name: "Grok" }));
    await user.click(await dialog.findByRole("button", { name: "Sign in with Grok" }));
    expect(mocks.startAuth).toHaveBeenCalledWith(
      "xai",
      expect.objectContaining({ usingApi: false }),
    );

    // The test page runs on localhost, so the redirect would come back by itself;
    // the manual paste stays one click away.
    await user.click(await dialog.findByRole("button", { name: /Didn't finish by itself/ }));
    mocks.getAuthStatus.mockResolvedValue({ status: "ok" });
    await user.type(
      await dialog.findByRole("textbox", { name: "Callback address" }),
      "grok-code{Enter}",
    );
    await waitFor(() =>
      expect(mocks.submitCallback).toHaveBeenCalledWith(
        "xai",
        { code: "grok-code", state: "xai-state" },
        { proxyId: undefined },
      ),
    );

    expect(await dialog.findByRole("heading", { name: "Grok account added" })).toBeInTheDocument();
    expect(await dialog.findByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "File group" })).toHaveTextContent(/xai/);

    await user.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByText("qwen.json")).not.toBeInTheDocument();
  }, 15000);

  test("reopening starts from a clean slate", async () => {
    const user = userEvent.setup();
    fakeWindow();
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://auth.openai.com/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&state=s1",
      state: "s1",
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Add AI account" }));
    let dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Sign in with Codex" }));
    expect(await dialog.findByText("Codex sign-in page opened in a new tab")).toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Add AI account" }));
    dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Sign in with Codex" })).toBeInTheDocument();
    expect(dialog.queryByText("Codex sign-in page opened in a new tab")).not.toBeInTheDocument();
  });
});
