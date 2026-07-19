import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ConfigPage } from "@pages/config/ConfigPage";
import type { VisualConfigValues } from "@features/visual-config-editor";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  fetchConfigYaml: vi.fn(),
  saveConfigYaml: vi.fn(),
  getConfig: vi.fn(),
  getCodexOAuthAdmission: vi.fn(),
  updateCodexOAuthAdmission: vi.fn(),
  updateRequestLogBodyStorage: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  configApi: {
    getConfig: mocks.getConfig,
    getCodexOAuthAdmission: mocks.getCodexOAuthAdmission,
    updateCodexOAuthAdmission: mocks.updateCodexOAuthAdmission,
    updateRequestLogBodyStorage: mocks.updateRequestLogBodyStorage,
  },
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

vi.mock("@pages/config/visual/VisualConfigEditor", () => ({
  VisualConfigEditor: ({
    values,
    onChange,
  }: {
    values: VisualConfigValues;
    onChange: (values: Partial<VisualConfigValues>) => void;
  }) => (
    <div data-testid="visual-config-editor">
      {values.payloadOverrideRules[0]?.models[0]?.name ?? "no payload override"}
      <button
        type="button"
        onClick={() =>
          onChange({
            requestLogStorage: { ...values.requestLogStorage, storeContent: false },
          })
        }
      >
        disable body storage
      </button>
    </div>
  ),
}));

function renderPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <ConfigPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

describe("ConfigPage", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    localStorage.clear();
    mocks.fetchConfigYaml.mockResolvedValue("port: 8318\nlogging-to-file: true\n");
    mocks.saveConfigYaml.mockResolvedValue({});
    mocks.getCodexOAuthAdmission.mockResolvedValue({
      allowed_clients: [],
      available_allowed_clients: [],
    });
    mocks.updateCodexOAuthAdmission.mockResolvedValue({ status: "ok" });
    mocks.updateRequestLogBodyStorage.mockResolvedValue({
      enabled: false,
      cleanup: { physical_reclaim_deferred: true },
    });
    mocks.getConfig.mockResolvedValue({
      payload: {
        override: [
          {
            models: [{ name: "gpt-5.4", protocol: "codex" }],
            params: { service_tier: "priority" },
          },
        ],
      },
    });
  });

  test("loads DB-backed payload rules into the visual editor after YAML cleanup", async () => {
    renderPage();

    expect(await screen.findByTestId("visual-config-editor")).toHaveTextContent("gpt-5.4");

    await waitFor(() => {
      expect(mocks.fetchConfigYaml).toHaveBeenCalledTimes(1);
      expect(mocks.getConfig).toHaveBeenCalledTimes(1);
    });
  });

  test("removes the duplicate runtime tab and confirms destructive body cleanup on save", async () => {
    const user = userEvent.setup();
    mocks.fetchConfigYaml.mockResolvedValue(
      [
        "port: 8318",
        "request-log-storage:",
        "  store-content: true",
        "  content-retention-days: 30",
        "  cleanup-interval-minutes: 1440",
        "  max-total-size-mb: 1024",
        "  vacuum-on-cleanup: true",
      ].join("\n"),
    );
    renderPage();

    expect(await screen.findByTestId("visual-config-editor")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /runtime config/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /disable body storage/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/historical request and response bodies/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save anyway/i }));

    await waitFor(() => {
      expect(mocks.updateRequestLogBodyStorage).toHaveBeenCalledWith(false, true);
    });
    expect(mocks.saveConfigYaml).toHaveBeenCalledWith(
      expect.stringContaining("store-content: false"),
    );
  });

});
