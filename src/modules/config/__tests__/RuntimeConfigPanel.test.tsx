import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { RuntimeConfigPanel } from "@/modules/config/RuntimeConfigPanel";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";
import { ToastProvider } from "@/modules/ui/ToastProvider";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getLogsMaxTotalSizeMb: vi.fn(),
  getForceModelPrefix: vi.fn(),
  getRoutingStrategy: vi.fn(),
  updateProxyUrl: vi.fn(),
  clearProxyUrl: vi.fn(),
  updateRequestRetry: vi.fn(),
  updateLogsMaxTotalSizeMb: vi.fn(),
  updateRoutingStrategy: vi.fn(),
  updateDebug: vi.fn(),
  updateUsageStatistics: vi.fn(),
  updateRequestLog: vi.fn(),
  updateLoggingToFile: vi.fn(),
  updateWsAuth: vi.fn(),
  updateSwitchProject: vi.fn(),
  updateSwitchPreviewModel: vi.fn(),
  updateForceModelPrefix: vi.fn(),
}));

vi.mock("@/lib/http/apis/config", () => ({
  configApi: {
    getConfig: mocks.getConfig,
    getLogsMaxTotalSizeMb: mocks.getLogsMaxTotalSizeMb,
    getForceModelPrefix: mocks.getForceModelPrefix,
    getRoutingStrategy: mocks.getRoutingStrategy,
    updateProxyUrl: mocks.updateProxyUrl,
    clearProxyUrl: mocks.clearProxyUrl,
    updateRequestRetry: mocks.updateRequestRetry,
    updateLogsMaxTotalSizeMb: mocks.updateLogsMaxTotalSizeMb,
    updateRoutingStrategy: mocks.updateRoutingStrategy,
    updateDebug: mocks.updateDebug,
    updateUsageStatistics: mocks.updateUsageStatistics,
    updateRequestLog: mocks.updateRequestLog,
    updateLoggingToFile: mocks.updateLoggingToFile,
    updateWsAuth: mocks.updateWsAuth,
    updateSwitchProject: mocks.updateSwitchProject,
    updateSwitchPreviewModel: mocks.updateSwitchPreviewModel,
    updateForceModelPrefix: mocks.updateForceModelPrefix,
  },
}));

function renderPanel() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <RuntimeConfigPanel />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("RuntimeConfigPanel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    mocks.getConfig.mockResolvedValue({
      debug: false,
      "usage-statistics-enabled": true,
      "request-log": false,
      "logging-to-file": false,
      "ws-auth": true,
      proxyUrl: "http://127.0.0.1:7890",
      requestRetry: 2,
    });
    mocks.getLogsMaxTotalSizeMb.mockResolvedValue(128);
    mocks.getForceModelPrefix.mockResolvedValue(false);
    mocks.getRoutingStrategy.mockResolvedValue("round-robin");
    mocks.updateProxyUrl.mockResolvedValue({});
    mocks.clearProxyUrl.mockResolvedValue({});
    mocks.updateRequestRetry.mockResolvedValue({});
    mocks.updateLogsMaxTotalSizeMb.mockResolvedValue({});
    mocks.updateRoutingStrategy.mockResolvedValue({});
  });

  test("saves modified runtime text fields and reloads config", async () => {
    renderPanel();

    const proxyInput = await screen.findByPlaceholderText(/proxy/i);
    const retryInput = screen.getByPlaceholderText(/retry/i);
    const logsInput = screen.getByPlaceholderText(/logs-max-total-size-mb/i);
    const routingInput = screen.getByPlaceholderText(/routing/i);

    await userEvent.clear(proxyInput);
    await userEvent.type(proxyInput, "http://127.0.0.1:9999");
    await userEvent.clear(retryInput);
    await userEvent.type(retryInput, "4");
    await userEvent.clear(logsInput);
    await userEvent.type(logsInput, "256");
    await userEvent.clear(routingInput);
    await userEvent.type(routingInput, "fill-first");

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateProxyUrl).toHaveBeenCalledWith("http://127.0.0.1:9999");
      expect(mocks.updateRequestRetry).toHaveBeenCalledWith(4);
      expect(mocks.updateLogsMaxTotalSizeMb).toHaveBeenCalledWith(256);
      expect(mocks.updateRoutingStrategy).toHaveBeenCalledWith("fill-first");
    });
    expect(mocks.getConfig).toHaveBeenCalledTimes(2);
  });

  test("rejects invalid retry counts before saving", async () => {
    renderPanel();

    const retryInput = await screen.findByPlaceholderText(/retry/i);
    await userEvent.clear(retryInput);
    await userEvent.type(retryInput, "-1");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateRequestRetry).not.toHaveBeenCalled();
    });
  });
});
