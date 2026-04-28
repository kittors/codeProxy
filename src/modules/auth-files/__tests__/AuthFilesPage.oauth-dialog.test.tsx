import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ToastProvider } from "@/modules/ui/ToastProvider";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { AuthFilesPage } from "@/modules/auth-files/AuthFilesPage";
import type { ProxyCheckResult, ProxyPoolEntry } from "@/lib/http/apis/proxies";

const mocks = vi.hoisted(() => ({
  list: vi.fn(async () => ({ files: [] })),
  getEntityStats: vi.fn(async () => ({ source: [], auth_index: [] })),
  startAuth: vi.fn(async () => ({ url: "", state: "" })),
  getAuthStatus: vi.fn(async () => ({ status: "waiting" })),
  submitCallback: vi.fn(async () => ({})),
  iflowCookieAuth: vi.fn(async () => ({ status: "ok" })),
  importCredential: vi.fn(async () => ({})),
  proxiesList: vi.fn<() => Promise<ProxyPoolEntry[]>>(async () => []),
  proxiesCheck: vi.fn<() => Promise<ProxyCheckResult>>(async () => ({ ok: true, latencyMs: 88 })),
}));

vi.mock("@/lib/http/apis", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/http/apis")>();
  return {
    ...mod,
    authFilesApi: { ...mod.authFilesApi, list: mocks.list },
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

vi.mock("@/lib/http/apis/proxies", () => ({
  proxiesApi: {
    list: mocks.proxiesList,
    check: mocks.proxiesCheck,
  },
}));

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.list.mockClear();
  mocks.getEntityStats.mockClear();
  mocks.startAuth.mockClear();
  mocks.getAuthStatus.mockClear();
  mocks.submitCallback.mockClear();
  mocks.iflowCookieAuth.mockClear();
  mocks.importCredential.mockClear();
  mocks.proxiesList.mockReset();
  mocks.proxiesCheck.mockReset();
  mocks.proxiesList.mockResolvedValue([]);
  mocks.proxiesCheck.mockResolvedValue({ ok: true, latencyMs: 88 });
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

    const openBtn = await screen.findByRole("button", { name: "Add OAuth Login" });
    await user.click(openBtn);

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);

    expect(scoped.getByText("Add OAuth Login")).toBeInTheDocument();
    expect(scoped.getByRole("tab", { name: "Codex OAuth" })).toBeInTheDocument();
    expect(scoped.getByRole("tab", { name: "Anthropic OAuth" })).toBeInTheDocument();
    expect(scoped.getByRole("tab", { name: "iFlow Cookie Auth" })).toBeInTheDocument();
    expect(scoped.getByRole("tab", { name: "Vertex Credential Import" })).toBeInTheDocument();
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

    await user.click(await screen.findByRole("button", { name: "Add OAuth Login" }));

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    const tabs = scoped.getByRole("tablist");
    const proxySelect = await scoped.findByRole("combobox", { name: "Authorization Proxy" });

    expect(tabs.compareDocumentPosition(proxySelect) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
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

    await user.click(await screen.findByRole("button", { name: "Add OAuth Login" }));

    const dialog = await screen.findByRole("dialog");
    const scoped = within(dialog);
    const proxySelect = await scoped.findByRole("combobox", { name: "Authorization Proxy" });

    expect(proxySelect).toHaveTextContent("Server local network");
    await waitFor(() => expect(mocks.proxiesCheck).toHaveBeenCalledWith({ id: "hk" }));
    await user.click(proxySelect);
    expect(await screen.findByText("127.0.0.1:1080")).toBeInTheDocument();
    expect(screen.getByText(/88 ms/)).toBeInTheDocument();
    expect(screen.getByText("Codex egress")).toBeInTheDocument();

    await user.click(await screen.findByRole("option", { name: /HK Proxy.*127\.0\.0\.1:1080/i }));
    await user.click(scoped.getByRole("button", { name: "Start authorization" }));

    await waitFor(() => {
      expect(mocks.startAuth).toHaveBeenCalledWith("codex", { proxyId: "hk" });
    });
  });
});
