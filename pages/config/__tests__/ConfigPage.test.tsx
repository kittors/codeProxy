import { render, screen, waitFor } from "@testing-library/react";
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
}));

vi.mock("@code-proxy/api-client", () => ({
  configApi: {
    getConfig: mocks.getConfig,
  },
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

vi.mock("@pages/config/RuntimeConfigPanel", () => ({
  RuntimeConfigPanel: () => <div data-testid="runtime-config-panel" />,
}));

vi.mock("@pages/config/visual/VisualConfigEditor", () => ({
  VisualConfigEditor: ({ values }: { values: VisualConfigValues }) => (
    <div data-testid="visual-config-editor">
      {values.payloadOverrideRules[0]?.models[0]?.name ?? "no payload override"}
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
});
