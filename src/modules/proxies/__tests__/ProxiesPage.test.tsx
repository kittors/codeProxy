import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { ProxiesPage } from "@/modules/proxies/ProxiesPage";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
}));

const proxyCheckCacheKey = "proxiesPage.checkState.v1";

vi.mock("@/lib/http/client", () => ({
  apiClient: {
    get: mocks.apiGet,
    put: mocks.apiPut,
    post: mocks.apiPost,
  },
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ProxiesPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ProxiesPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    window.sessionStorage.clear();
    mocks.apiGet.mockReset();
    mocks.apiPut.mockReset();
    mocks.apiPost.mockReset();
    mocks.apiGet.mockResolvedValue({
      items: [
        {
          id: "hk",
          name: "HK Proxy",
          url: "socks5://user:pass@127.0.0.1:1080",
          masked_url: "socks5://127.0.0.1:1080",
          enabled: true,
          description: "Codex egress",
        },
      ],
    });
    mocks.apiPut.mockResolvedValue({ status: "ok" });
    mocks.apiPost.mockResolvedValue({ ok: true, status_code: 204, latency_ms: 31 });
  });

  test("loads proxy entries with protocol, IP, remark, and no proxy URL", async () => {
    renderPage();

    expect(await screen.findByRole("table", { name: /proxy pool table/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /proxy url/i })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /protocol.*ip/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /remark/i })).toBeInTheDocument();

    expect(await screen.findByText("HK Proxy")).toBeInTheDocument();
    expect(screen.getByText("SOCKS5")).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:1080")).toBeInTheDocument();
    expect(screen.queryByText("socks5://127.0.0.1:1080")).not.toBeInTheDocument();
    expect(screen.queryByText("socks5://user:pass@127.0.0.1:1080")).not.toBeInTheDocument();
    expect(screen.getByText("Codex egress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check hk proxy/i })).toBeInTheDocument();
  });

  test("checks all proxy entries after loading the page", async () => {
    mocks.apiGet.mockResolvedValue({
      items: [
        {
          id: "hk",
          name: "HK Proxy",
          url: "socks5://user:pass@127.0.0.1:1080",
          enabled: true,
        },
        {
          id: "us",
          name: "US Proxy",
          url: "http://127.0.0.1:7890",
          enabled: true,
        },
      ],
    });

    renderPage();

    await screen.findByText("HK Proxy");
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2));
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "hk" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "us" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
  });

  test("keeps the previous check result visible while refreshing checks", async () => {
    let resolveNextCheck: ((value: unknown) => void) | undefined;
    mocks.apiPost
      .mockResolvedValueOnce({ ok: true, status_code: 204, latency_ms: 31 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNextCheck = resolve;
          }),
      );

    renderPage();

    expect(await screen.findByText(/31 ms/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/31 ms/i)).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveNextCheck?.({ ok: true, status_code: 204, latency_ms: 44 });

    expect(await screen.findByText(/44 ms/i)).toBeInTheDocument();
  });

  test("renders cached check results on page entry while refreshing them in the background", async () => {
    let resolveNextCheck: ((value: unknown) => void) | undefined;
    window.sessionStorage.setItem(
      proxyCheckCacheKey,
      JSON.stringify({
        hk: { ok: true, statusCode: 204, latencyMs: 31 },
      }),
    );
    mocks.apiPost.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveNextCheck = resolve;
        }),
    );

    renderPage();

    expect(await screen.findByText(/31 ms/i)).toBeInTheDocument();
    await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    resolveNextCheck?.({ ok: true, status_code: 204, latency_ms: 44 });

    expect(await screen.findByText(/44 ms/i)).toBeInTheDocument();
  });

  test("keeps the proxy table chrome minimal when empty", async () => {
    mocks.apiGet.mockResolvedValue({ items: [] });

    renderPage();

    const table = await screen.findByRole("table", { name: /proxy pool table/i });
    expect(table).toBeInTheDocument();
    expect(table.closest("section")).toHaveClass("p-5");
    expect(screen.queryByText("Proxy Pool")).not.toBeInTheDocument();
    expect(screen.queryByText(/Manage proxy entries in a compact table/i)).not.toBeInTheDocument();
    expect(screen.getByText("No proxies yet")).toBeInTheDocument();
    expect(screen.queryByText(/Add HTTP, HTTPS, or SOCKS5 proxies/i)).not.toBeInTheDocument();
  });

  test("adds a proxy and persists through the proxy pool API", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /add proxy/i }));
    const dialog = await screen.findByRole("dialog", { name: /add proxy/i });

    await userEvent.type(within(dialog).getByLabelText(/name/i), "US Proxy");
    await userEvent.type(within(dialog).getByLabelText(/proxy url/i), "http://127.0.0.1:7890");
    await userEvent.type(within(dialog).getByLabelText(/remark/i), "OpenAI egress");
    await userEvent.click(within(dialog).getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.apiPut).toHaveBeenCalledWith(
        "/proxy-pool",
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "US Proxy",
              url: "http://127.0.0.1:7890",
              description: "OpenAI egress",
              enabled: true,
            }),
          ]),
        }),
      );
    });
  });

  test("checks a proxy and renders the last check result", async () => {
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check hk proxy/i }));

    expect(await screen.findByText(/available/i)).toBeInTheDocument();
    const latency = screen.getByText(/31 ms/i);
    expect(latency).toBeInTheDocument();
    expect(latency.closest("[data-latency-tone]")).toHaveAttribute("data-latency-tone", "fast");
    expect(screen.queryByText(/204/)).not.toBeInTheDocument();
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "hk" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
  });

  test("uses a different latency tone for slow available checks", async () => {
    mocks.apiPost.mockResolvedValue({ ok: true, latency_ms: 1800 });

    renderPage();

    const latency = await screen.findByText(/1800 ms/i);

    expect(latency.closest("[data-latency-tone]")).toHaveAttribute("data-latency-tone", "slow");
  });

  test("renders failed proxy checks with the backend message", async () => {
    mocks.apiPost.mockResolvedValue({
      ok: false,
      status_code: 0,
      latency_ms: 12001,
      message: "proxy dial timeout",
    });

    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /check hk proxy/i }));

    expect(await screen.findByText(/unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/proxy dial timeout/i)).toBeInTheDocument();
  });
});
