import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@code-proxy/ui";
import { ThemeProvider } from "@code-proxy/ui";
import { AuthFilesPage } from "@pages/auth-files/AuthFilesPage";
import type { AuthFileItem } from "@code-proxy/api-client";
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

vi.mock("goey-toast", () => ({
  GoeyToaster: () => null,
  goeyToast: toastMocks,
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

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

describe("AuthFilesPage OAuth login dialog", () => {
  test("opens OAuth dialog with provider/iFlow/Vertex tabs", async () => {
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

    const openBtn = await screen.findByRole("button", {
      name: "Add OAuth Login",
    });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    expect(scoped.getByText("Add OAuth Login")).toBeInTheDocument();
    expect(
      scoped.getByRole("tab", { name: "Codex OAuth" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("tab", { name: "Anthropic OAuth" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("tab", { name: "iFlow Cookie Auth" }),
    ).toBeInTheDocument();
    expect(
      scoped.getByRole("tab", { name: "Vertex Credential Import" }),
    ).toBeInTheDocument();
  });

  test("places the authorization proxy selector below the OAuth provider tabs", async () => {
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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    const tabs = scoped.getByRole("tablist");
    const proxySelect = await scoped.findByRole("combobox", {
      name: "Authorization Proxy",
    });

    expect(
      tabs.compareDocumentPosition(proxySelect) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  test("selects a proxy with IP, latency, and remark before starting OAuth authorization", async () => {
    const user = userEvent.setup();
    mocks.proxiesList.mockResolvedValue([
      {
        id: "hk",
        name: "HK Proxy",
        url: "socks5://user:pass@127.0.0.1:1080",
        enabled: true,
        description: "Codex egress",
      },
    ]);

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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    const proxySelect = await scoped.findByRole("combobox", {
      name: "Authorization Proxy",
    });

    expect(proxySelect).toHaveTextContent("Server local network");
    await waitFor(() =>
      expect(mocks.proxiesCheck).toHaveBeenCalledWith({ id: "hk" }),
    );
    await user.click(proxySelect);
    expect(await screen.findByText("127.0.0.1:1080")).toBeInTheDocument();
    expect(screen.getByText(/88 ms/)).toBeInTheDocument();
    expect(screen.getByText("Codex egress")).toBeInTheDocument();

    await user.click(
      await screen.findByRole("option", {
        name: /HK Proxy.*127\.0\.0\.1:1080/i,
      }),
    );
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );

    await waitFor(() => {
      expect(mocks.startAuth).toHaveBeenCalledWith("codex", { proxyId: "hk" });
    });
  });

  test("shows translated callback guidance instead of raw oauth keys after starting authorization", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://example.com/oauth",
      state: "oauth-state",
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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );

    expect(await scoped.findByText("Status")).toBeInTheDocument();
    expect(scoped.getByText("Callback URL")).toBeInTheDocument();
    expect(
      scoped.getByText(
        "After authorizing in the browser, the browser address bar contains the callback URL. Copy the full URL and submit it below.",
      ),
    ).toBeInTheDocument();
    expect(scoped.queryByText("oauth.status")).not.toBeInTheDocument();
    expect(scoped.queryByText("oauth.callback")).not.toBeInTheDocument();
  });

  test("submits the xAI code with the pending OAuth state", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://accounts.x.ai/oauth2/consent",
      state: "xai-state",
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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    await user.click(scoped.getByRole("tab", { name: "xAI / Grok OAuth" }));
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );
    await waitFor(() =>
      expect(mocks.startAuth).toHaveBeenCalledWith("xai", {}),
    );

    await user.type(
      scoped.getByPlaceholderText("Paste the code shown by xAI / Grok"),
      "manual-code",
    );
    await user.click(scoped.getByRole("button", { name: "Submit callback" }));

    await waitFor(() => {
      expect(mocks.submitCallback).toHaveBeenCalledWith(
        "xai",
        { code: "manual-code", state: "xai-state" },
        {},
      );
    });
  });

  test("clears OAuth dialog state when reopened", async () => {
    const user = userEvent.setup();
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://example.com/oauth",
      state: "oauth-state",
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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );
    expect(await scoped.findByText("https://example.com/oauth")).toBeInTheDocument();

    const callbackInput = scoped.getByPlaceholderText(
      "Paste the full callback URL from browser",
    );
    await user.type(
      callbackInput,
      "http://localhost:1455/auth/callback?code=test-code&state=oauth-state",
    );
    expect(callbackInput).toHaveValue(
      "http://localhost:1455/auth/callback?code=test-code&state=oauth-state",
    );

    await user.click(scoped.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Add OAuth Login" }));
    const reopened = within(await screen.findByRole("dialog"));

    expect(reopened.queryByText("https://example.com/oauth")).not.toBeInTheDocument();
    expect(
      reopened.getByPlaceholderText("Paste the full callback URL from browser"),
    ).toHaveValue("");
  });

  test("shows one OAuth success toast when an old poll resolves after restart", async () => {
    const user = userEvent.setup();
    const firstPoll = deferred<{ status: "ok" }>();
    const secondPoll = deferred<{ status: "ok" }>();
    mocks.list
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValue({
        files: [
          {
            name: "xai-new.json",
            type: "xai",
            size: 2048,
            modified: Date.now(),
            disabled: false,
          },
        ],
      });
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://accounts.x.ai/oauth2/consent",
      state: "xai-state",
    });
    mocks.getAuthStatus
      .mockImplementationOnce(() => firstPoll.promise)
      .mockImplementationOnce(() => secondPoll.promise);

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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    await user.click(scoped.getByRole("tab", { name: "xAI / Grok OAuth" }));
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );
    await waitFor(() => expect(mocks.getAuthStatus).toHaveBeenCalledTimes(1));

    await user.type(
      scoped.getByPlaceholderText("Paste the code shown by xAI / Grok"),
      "manual-code",
    );
    await user.click(scoped.getByRole("button", { name: "Submit callback" }));
    await waitFor(() => expect(mocks.getAuthStatus).toHaveBeenCalledTimes(2));

    secondPoll.resolve({ status: "ok" });
    await waitFor(() =>
      expect(
        toastMocks.success.mock.calls.filter(
          ([title]) => title === "xAI / Grok OAuth authorization succeeded",
        ),
      ).toHaveLength(1),
    );

    firstPoll.resolve({ status: "ok" });
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(
      toastMocks.success.mock.calls.filter(
        ([title]) => title === "xAI / Grok OAuth authorization succeeded",
      ),
    ).toHaveLength(1);
  });

  test("keeps the dialog open until OAuth completes and the new auth file is listed", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "authFilesPage.filesViewMode.v1",
      JSON.stringify("cards"),
    );
    mocks.startAuth.mockResolvedValueOnce({
      url: "https://example.com/oauth",
      state: "oauth-state",
    });
    mocks.getAuthStatus.mockResolvedValue({ status: "wait" });
    mocks.list
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValueOnce({
        files: [
          {
            name: "codex-new.json",
            type: "codex",
            size: 2048,
            modified: Date.now(),
            disabled: false,
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

    await user.click(
      await screen.findByRole("button", { name: "Add OAuth Login" }),
    );

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    await user.click(
      scoped.getByRole("button", { name: "Start authorization" }),
    );
    await waitFor(() => expect(mocks.startAuth).toHaveBeenCalledTimes(1));

    await user.type(
      scoped.getByPlaceholderText("Paste the full callback URL from browser"),
      "http://localhost:1455/auth/callback?code=test-code&state=test-state",
    );
    await user.click(scoped.getByRole("button", { name: "Submit callback" }));

    await waitFor(() => expect(mocks.submitCallback).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 250));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("codex-new.json")).not.toBeInTheDocument();

    mocks.getAuthStatus.mockResolvedValueOnce({ status: "ok" });
    await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(3), {
      timeout: 5000,
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("auth-files-cards")).toHaveTextContent(
      "codex-new.json",
    );
  }, 12000);
});
