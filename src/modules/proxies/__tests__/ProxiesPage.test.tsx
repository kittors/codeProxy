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
    mocks.apiPost.mockResolvedValue({ ok: true, statusCode: 204, latencyMs: 31 });
  });

  test("loads proxy entries with masked URLs and status actions", async () => {
    renderPage();

    expect(await screen.findByRole("table", { name: /proxy pool table/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /proxy url/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /status/i })).toBeInTheDocument();

    expect(await screen.findByText("HK Proxy")).toBeInTheDocument();
    expect(screen.getByText("socks5://127.0.0.1:1080")).toBeInTheDocument();
    expect(screen.getByText("Codex egress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check hk proxy/i })).toBeInTheDocument();
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
    await userEvent.type(within(dialog).getByLabelText(/description/i), "OpenAI egress");
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

    expect(await screen.findByText(/204/)).toBeInTheDocument();
    expect(screen.getByText(/31 ms/i)).toBeInTheDocument();
    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/proxy-pool/check",
      { id: "hk" },
      expect.objectContaining({ timeoutMs: 12000 }),
    );
  });
});
