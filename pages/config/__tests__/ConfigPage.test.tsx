import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { ConfigPage } from "@pages/config/ConfigPage";
import { parse as parseYaml } from "yaml";
import { isDatabaseSetting, type VisualConfigValues } from "@features/visual-config-editor";
import { ThemeProvider } from "@code-proxy/ui";
import { ToastProvider } from "@code-proxy/ui";

const mocks = vi.hoisted(() => ({
  fetchConfigYaml: vi.fn(),
  saveConfigYaml: vi.fn(),
  getConfig: vi.fn(),
  getProxyUrl: vi.fn(),
  getCodexOAuthAdmission: vi.fn(),
  updateCodexOAuthAdmission: vi.fn(),
  updateRequestLogBodyStorage: vi.fn(),
}));

vi.mock("@code-proxy/api-client", () => ({
  configApi: {
    getConfig: mocks.getConfig,
    getProxyUrl: mocks.getProxyUrl,
    getCodexOAuthAdmission: mocks.getCodexOAuthAdmission,
    updateCodexOAuthAdmission: mocks.updateCodexOAuthAdmission,
    updateRequestLogBodyStorage: mocks.updateRequestLogBodyStorage,
  },
  configFileApi: {
    fetchConfigYaml: mocks.fetchConfigYaml,
    saveConfigYaml: mocks.saveConfigYaml,
  },
}));

const SAVED_PROXY = "socks5://relay:p%40ss@203.0.113.7:1080";

vi.mock("@pages/config/visual/VisualConfigEditor", () => ({
  VisualConfigEditor: ({
    values,
    onChange,
    toolbarEnd,
    lockDatabaseSettings,
  }: {
    values: VisualConfigValues;
    onChange: (values: Partial<VisualConfigValues>) => void;
    toolbarEnd?: React.ReactNode;
    lockDatabaseSettings?: boolean;
  }) => (
    <div data-testid="visual-config-editor">
      {/* 真实编辑器把「可视化 / 源码」切换渲染在工具栏右侧，替身也要渲染出来。 */}
      {toolbarEnd}
      {values.payloadOverrideRules[0]?.models[0]?.name ?? "no payload override"}
      <output data-testid="proxy-url">{values.proxyUrl || "no proxy"}</output>
      <output data-testid="database-settings">{lockDatabaseSettings ? "locked" : "editable"}</output>
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
      <button type="button" onClick={() => onChange({ proxyUrl: SAVED_PROXY })}>
        set proxy
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
    mocks.getProxyUrl.mockResolvedValue("");
  });

  test("loads DB-backed payload rules into the visual editor after YAML cleanup", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("visual-config-editor")).toHaveTextContent("gpt-5.4");
    });
    expect(mocks.fetchConfigYaml).toHaveBeenCalledTimes(1);
    expect(mocks.getConfig).toHaveBeenCalledTimes(1);
  });

  test("shows the saved global proxy again although config.yaml no longer holds it", async () => {
    const user = userEvent.setup();
    // 后端把 proxy-url 存进数据库后会从 config.yaml 里删掉；GET /config 里的是脱敏的。
    mocks.fetchConfigYaml.mockResolvedValue("port: 8318\n");
    mocks.getConfig.mockResolvedValue({ "proxy-url": "socks5://203.0.113.7:1080/***" });
    mocks.getProxyUrl.mockResolvedValueOnce("").mockResolvedValue(SAVED_PROXY);
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("proxy-url")).toHaveTextContent("no proxy");
    });
    await user.click(screen.getByRole("button", { name: "set proxy" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.saveConfigYaml).toHaveBeenCalledTimes(1);
    });
    // 存在数据库里的设置只写改过的那一项，没碰的不跟着写回去。
    const saved = parseYaml(String(mocks.saveConfigYaml.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(Object.keys(saved).filter(isDatabaseSetting)).toEqual(["proxy-url"]);
    expect(saved["proxy-url"]).toBe(SAVED_PROXY);
    await waitFor(() => {
      expect(screen.getByTestId("proxy-url")).toHaveTextContent(SAVED_PROXY);
    });
  });

  test("turns off body storage that only the database knows is on, and clears stored bodies", async () => {
    const user = userEvent.setup();
    mocks.fetchConfigYaml.mockResolvedValue("port: 8318\n");
    mocks.getConfig.mockResolvedValue({
      "request-log-storage": {
        "store-content": true,
        "retention-days": 7,
        "content-retention-days": 30,
        "cleanup-enabled": true,
        "cleanup-interval-minutes": 1440,
        "max-total-size-mb": 1024,
      },
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId("database-settings")).toHaveTextContent("editable");
    });
    await user.click(screen.getByRole("button", { name: /disable body storage/i }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/historical request and response bodies/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save anyway/i }));

    await waitFor(() => {
      expect(mocks.updateRequestLogBodyStorage).toHaveBeenCalledWith(false, true);
    });
    const saved = String(mocks.saveConfigYaml.mock.calls[0]?.[0]);
    expect(saved).toContain("store-content: false");
    // 其余保留设置照数据库里的值写回，不被页面默认值顶替。
    expect(saved).toContain("content-retention-days: 30");
    expect(saved).toContain("max-total-size-mb: 1024");
  });

  test("locks the database-backed settings when the running config can't be read", async () => {
    mocks.getConfig.mockRejectedValue(new Error("403 forbidden"));
    renderPage();

    expect(
      await screen.findByText("Couldn't read the settings stored in the database"),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(403 forbidden\)/)).toBeInTheDocument();
    expect(screen.getByTestId("database-settings")).toHaveTextContent("locked");
  });

  test("explains in the source editor that database-backed settings are not in the file", async () => {
    const user = userEvent.setup();
    mocks.getConfig.mockResolvedValue({ "runtime-setting-versions": { "proxy-url": 3 } });
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /source editor/i }));
    expect(await screen.findByText(/live in the database, not in this file/i)).toBeInTheDocument();
  });

  test("keeps quiet about the database on backends that still keep these settings in the file", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /source editor/i }));
    await waitFor(() => expect(mocks.getProxyUrl).toHaveBeenCalled());
    expect(screen.queryByText(/live in the database, not in this file/i)).not.toBeInTheDocument();
  });

  test("scrolls the source editor to the active search match", async () => {
    const user = userEvent.setup();
    const yaml = [
      "target-key: first",
      ...Array.from({ length: 80 }, (_, index) => `key-${index}: value-${index}`),
      "target-key: last",
    ].join("\n");
    mocks.fetchConfigYaml.mockResolvedValue(yaml);
    renderPage();

    await user.click(await screen.findByRole("tab", { name: /source editor/i }));
    const editor = screen.getByRole("textbox", { name: "config.yaml editor" });
    Object.defineProperties(editor, {
      clientHeight: { configurable: true, value: 120 },
      clientWidth: { configurable: true, value: 480 },
    });

    const search = screen.getByPlaceholderText(/search config content/i);
    await user.type(search, "target-key{Enter}");

    expect(editor).toHaveProperty("selectionStart", yaml.indexOf("target-key"));

    await user.click(screen.getByRole("button", { name: /next match/i }));
    await waitFor(() => {
      expect(editor.scrollTop).toBeGreaterThan(0);
      expect(editor).toHaveProperty("selectionStart", yaml.lastIndexOf("target-key"));
    });

    await user.click(screen.getByRole("button", { name: /previous match/i }));
    await waitFor(() => {
      expect(editor.scrollTop).toBe(0);
      expect(editor).toHaveProperty("selectionStart", yaml.indexOf("target-key"));
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
