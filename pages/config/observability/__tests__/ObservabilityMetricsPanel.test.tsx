import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import type { ObservabilityMetricsSettings } from "@code-proxy/api-client";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { ObservabilityMetricsPanel } from "@pages/config/observability/ObservabilityMetricsPanel";
import { useObservabilityMetrics } from "@pages/config/observability/useObservabilityMetrics";

const mocks = vi.hoisted(() => ({
  getMetrics: vi.fn<() => Promise<ObservabilityMetricsSettings>>(),
  setMetricsEnabled: vi.fn<(enabled: boolean) => Promise<ObservabilityMetricsSettings>>(),
  rotateMetricsToken: vi.fn<() => Promise<ObservabilityMetricsSettings>>(),
  can: vi.fn<(permission: string) => boolean>(),
}));

vi.mock("@code-proxy/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@code-proxy/api-client")>()),
  observabilityApi: {
    getMetrics: mocks.getMetrics,
    setMetricsEnabled: mocks.setMetricsEnabled,
    rotateMetricsToken: mocks.rotateMetricsToken,
  },
}));

// 后端挂在反向代理的子路径下：抓取地址要带上这段前缀。
vi.mock("@app/providers/AuthProvider", () => ({
  useOptionalAuth: () => ({
    can: mocks.can,
    state: { apiBase: "https://relay.example.test/relay" },
  }),
}));

const TOKEN = "crm_XfakeXscrapeXtokenXforXtestsXonlyXXXXXXXX";
const ROTATED = "crm_XrotatedXfakeXtokenXforXtestsXonlyXXXXXXX";

const off: ObservabilityMetricsSettings = {
  enabled: false,
  token_configured: false,
  path: "/metrics",
  persistent: true,
};

const on: ObservabilityMetricsSettings = {
  enabled: true,
  token_configured: true,
  token_hint: "XXXX",
  token_created_at: "2026-10-30T01:00:00Z",
  updated_at: "2026-10-30T01:00:00Z",
  path: "/metrics",
  persistent: true,
};

function renderPanel(initial: ObservabilityMetricsSettings) {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ObservabilityMetricsPanel initial={initial} />
      </ToastProvider>
    </ThemeProvider>,
  );
}

const toggle = () => screen.getByRole("switch", { name: "Enable the metrics endpoint" });
const snippetText = () => document.querySelector("pre[data-code-block]")?.textContent ?? "";

describe("ObservabilityMetricsPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.can.mockImplementation(() => true);
  });

  test("turning it on shows the new token once and never leaves it on the page", async () => {
    mocks.setMetricsEnabled.mockResolvedValue({ ...on, token: TOKEN });
    renderPanel(off);
    expect(screen.queryByText("https://relay.example.test/relay/metrics")).toBeNull();

    await userEvent.click(toggle());
    expect(mocks.setMetricsEnabled).toHaveBeenCalledWith(true);
    const dialog = await screen.findByRole("dialog", { name: "Save the scrape token" });
    expect(within(dialog).getByText(TOKEN)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/\/etc\/prometheus\/clirelay-metrics\.token/),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(toggle()).toBeChecked();
    expect(screen.getByText("https://relay.example.test/relay/metrics")).toBeInTheDocument();
    expect(snippetText()).not.toContain(TOKEN);
  });

  test("gives a Prometheus config for the backend's own address, reading the token from a file", () => {
    renderPanel(on);
    expect(screen.getByText(/ending in XXXX/)).toBeInTheDocument();
    expect(snippetText()).toContain('metrics_path: "/relay/metrics"');
    expect(snippetText()).toContain("scheme: https");
    expect(snippetText()).toContain('credentials_file: "/etc/prometheus/clirelay-metrics.token"');
    expect(snippetText()).toContain('targets: ["relay.example.test"]');
  });

  test("asks before turning it off, and keeps it on when cancelled", async () => {
    mocks.setMetricsEnabled.mockResolvedValue({ ...on, enabled: false });
    renderPanel(on);

    await userEvent.click(toggle());
    let dialog = await screen.findByRole("dialog", { name: "Turn off the metrics endpoint?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.setMetricsEnabled).not.toHaveBeenCalled();
    expect(toggle()).toBeChecked();

    await userEvent.click(toggle());
    dialog = await screen.findByRole("dialog", { name: "Turn off the metrics endpoint?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(toggle()).not.toBeChecked());
    expect(mocks.setMetricsEnabled).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.queryByText("https://relay.example.test/relay/metrics")).toBeNull();
    expect(snippetText()).toBe("");
  });

  test("regenerating the token asks first and then shows the new one", async () => {
    mocks.rotateMetricsToken.mockResolvedValue({ ...on, token_hint: "XXXY", token: ROTATED });
    renderPanel(on);

    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    const confirm = await screen.findByRole("dialog", { name: "Regenerate the scrape token?" });
    expect(mocks.rotateMetricsToken).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole("button", { name: "Regenerate" }));

    const reveal = await screen.findByRole("dialog", { name: "Save the scrape token" });
    expect(within(reveal).getByText(ROTATED)).toBeInTheDocument();
    expect(mocks.rotateMetricsToken).toHaveBeenCalledOnce();
    await userEvent.click(within(reveal).getByRole("button", { name: "I've saved it" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/ending in XXXY/)).toBeInTheDocument();
  });

  test("a failed save leaves the switch where it was and says why", async () => {
    mocks.setMetricsEnabled.mockRejectedValue(
      new Error("observability settings could not be saved"),
    );
    renderPanel(off);

    await userEvent.click(toggle());
    expect(
      await screen.findByText("observability settings could not be saved"),
    ).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("cannot be turned on where the setting would not survive a restart", () => {
    renderPanel({ ...off, persistent: false });
    expect(screen.getByText(/no database attached/)).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
  });

  test("is read-only without write access to the system configuration", () => {
    mocks.can.mockImplementation((permission) => permission !== "system.config.write");
    renderPanel(on);
    expect(screen.getByText(/requires write access/)).toBeInTheDocument();
    expect(toggle()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
  });
});

describe("useObservabilityMetrics", () => {
  test("is null on a backend without the endpoint", async () => {
    mocks.getMetrics.mockRejectedValue(new Error("404 page not found"));
    const { result } = renderHook(() => useObservabilityMetrics());
    await waitFor(() => expect(mocks.getMetrics).toHaveBeenCalledOnce());
    // 让被拒的 promise 走完回调，再看结果仍是 null。
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  test("is null when the answer is not the settings object", async () => {
    mocks.getMetrics.mockResolvedValue(
      "<!doctype html>" as unknown as ObservabilityMetricsSettings,
    );
    const { result } = renderHook(() => useObservabilityMetrics());
    await waitFor(() => expect(mocks.getMetrics).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  test("returns the settings the backend reports", async () => {
    mocks.getMetrics.mockResolvedValue(off);
    const { result } = renderHook(() => useObservabilityMetrics());
    await waitFor(() => expect(result.current).toEqual(off));
  });
});
