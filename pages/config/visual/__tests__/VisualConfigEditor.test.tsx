import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { VisualConfigEditor } from "@pages/config/visual/VisualConfigEditor";
import { DEFAULT_VISUAL_VALUES, useVisualConfig } from "@features/visual-config-editor";
import { ThemeProvider } from "@code-proxy/ui";

function renderEditor(onChange = vi.fn()) {
  render(
    <ThemeProvider>
      <VisualConfigEditor
        values={{
          ...DEFAULT_VISUAL_VALUES,
          autoUpdateEnabled: true,
          autoUpdateChannel: "main",
          autoUpdateDockerImage: "ghcr.io/kittors/clirelay",
        }}
        onChange={onChange}
      />
    </ThemeProvider>,
  );
  return onChange;
}

describe("VisualConfigEditor auto update config", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows every setting's description inline next to its YAML key", () => {
    renderEditor();

    // 说明常驻显示，不再藏在 ⓘ 悬停提示里；YAML 键作为辅助信息附在后面。
    expect(
      screen.getByText(/Leave empty to listen on every interface/, { selector: "p" }),
    ).toBeVisible();
    expect(screen.getByText("host", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Listen address" })).toHaveAccessibleDescription(
      /Leave empty to listen on every interface/,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("lists what the low-resource profile would change, in English", async () => {
    render(
      <ThemeProvider>
        <VisualConfigEditor
          values={{ ...DEFAULT_VISUAL_VALUES, debug: true, logsMaxTotalSizeMb: "512" }}
          onChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText(/For a 2 vCPU \/ 2 GB host/)).toBeVisible();
    expect(screen.queryByText(/清理明细不会清理统计|适合 2 核 2G/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /see the 2 settings it changes/i }));
    const changes = await screen.findByRole("list");
    expect(changes).toHaveTextContent(/Debug mode/);
    expect(changes).toHaveTextContent(/File log size cap/);
  });

  test("shows automatic update settings and exposes main/dev source branches", async () => {
    const onChange = renderEditor();
    // 运行模式与更新在「运行」分组里：分组页签切过去才看得到。
    await userEvent.click(screen.getByRole("tab", { name: /^Behavior/ }));

    const toggle = screen.getByRole("switch", { name: /automatic update checks/i });
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ autoUpdateEnabled: false });

    // 两个选项直接摊开成卡片，选了会怎样写在选项里。
    const branches = screen.getByRole("radiogroup", { name: /update source branch/i });
    expect(within(branches).getByRole("radio", { name: /^stable/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(branches).queryByRole("radio", { name: /auto-detect/i })).toBeNull();
    await userEvent.click(within(branches).getByRole("radio", { name: /development/i }));

    expect(onChange).toHaveBeenCalledWith({ autoUpdateChannel: "dev" });
  });

  test("marks changed settings, counts them per section and reverts one", async () => {
    const onChange = vi.fn();
    render(
      <ThemeProvider>
        <VisualConfigEditor
          values={{ ...DEFAULT_VISUAL_VALUES, port: "9000", proxyUrl: "socks5://p:1080" }}
          baseline={{ ...DEFAULT_VISUAL_VALUES, port: "8318" }}
          onChange={onChange}
        />
      </ThemeProvider>,
    );

    // 分组页签：有改动的组带「有未保存的修改」，没改动的组没有。
    expect(screen.getByRole("tab", { name: /^Basics.*has unsaved changes/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Behavior.*has unsaved changes/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Logs & data$/ })).toBeTruthy();
    // 当前分组的分区胶囊：精确到哪个分区改了。
    const nav = screen.getByRole("navigation", { name: "Config sections" });
    expect(within(nav).getByRole("button", { name: /Server.*has unsaved changes/ })).toBeTruthy();
    expect(within(nav).getByRole("button", { name: /^Remote management$/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: /^Behavior/ }));
    expect(
      within(screen.getByRole("navigation", { name: "Config sections" })).getByRole("button", {
        name: /Network & retries.*has unsaved changes/,
      }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: /^Basics/ }));

    const portRow = document.getElementById("config-field-port")!;
    expect(portRow).toHaveAttribute("data-modified", "true");
    await userEvent.click(within(portRow).getByRole("button", { name: /revert/i }));
    expect(onChange).toHaveBeenLastCalledWith({ port: "8318" });
  });

  test("flags a non-numeric port inline instead of letting it be dropped on save", () => {
    render(
      <ThemeProvider>
        <VisualConfigEditor values={{ ...DEFAULT_VISUAL_VALUES, port: "80a" }} onChange={vi.fn()} />
      </ThemeProvider>,
    );
    // 网络分区的代理地址输入里也有一个「端口」，限定在服务分区里找监听端口。
    const server = document.querySelector<HTMLElement>('[data-config-section="server"]')!;
    const port = within(server).getByRole("textbox", { name: "Port" });
    expect(port).toHaveAttribute("aria-invalid", "true");
    expect(port).toHaveAccessibleDescription(/Enter a whole number/);
  });

  test("groups are tabs above the content, one group at a time, arrow keys move between them", async () => {
    renderEditor();
    expect(screen.getByRole("tab", { name: /^Basics/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Server" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Streaming" })).toBeNull();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName(/^Basics/);

    await userEvent.click(screen.getByRole("tab", { name: /^Behavior/ }));
    expect(screen.getByRole("heading", { name: "Streaming" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Server" })).toBeNull();

    screen.getByRole("tab", { name: /^Behavior/ }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /^Logs & data/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /^Logs & data/ })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Logging" })).toBeInTheDocument();
  });

  test("search spans every group, shows hits per tab, and picking a tab ends the search", async () => {
    renderEditor();
    await userEvent.type(screen.getByRole("textbox", { name: "Search settings" }), "retry");

    await waitFor(() =>
      expect(screen.getByRole("tabpanel", { name: "Search results" })).toBeInTheDocument(),
    );
    // 命中的「网络与重试」在「运行」组：不用先切过去就能搜到。
    expect(screen.getByRole("heading", { name: "Network & retries" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Behavior.*matching section/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Basics.*0 matching sections/ })).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: /^Basics/ }));
    expect(screen.getByRole("textbox", { name: "Search settings" })).toHaveValue("");
    expect(screen.getByRole("tab", { name: /^Basics/ })).toHaveAttribute("aria-selected", "true");
  });

  test("search narrows the page to matching settings", async () => {
    renderEditor();
    await userEvent.type(screen.getByRole("textbox", { name: "Search settings" }), "retry");

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Listen address" })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("textbox", { name: "Retry attempts" })).toBeInTheDocument();
    // YAML 键也参与搜索：max-retry-interval 的中文 / 英文名称里没有 retry。
    expect(screen.getByRole("textbox", { name: "Cooldown wait limit" })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole("textbox", { name: "Search settings" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Search settings" }), "zzzz-nothing");
    expect(await screen.findByText(/No settings match/)).toBeInTheDocument();
  });

  test("exposes custom docker image repository with a risk warning", async () => {
    const onChange = renderEditor();
    await userEvent.click(screen.getByRole("tab", { name: /^Behavior/ }));

    const input = screen.getByRole("textbox", { name: /docker image repository/i });
    expect(input).toHaveValue("ghcr.io/kittors/clirelay");
    expect(screen.getByText(/custom images can break updates/i)).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "registry.local/mirror/clirelay" } });

    expect(onChange).toHaveBeenLastCalledWith({
      autoUpdateDockerImage: "registry.local/mirror/clirelay",
    });
  });

  test("loads and writes auto-update settings in config yaml", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        "auto-update:\n  enabled: false\n  channel: dev\n  docker-image: registry.local/mirror/clirelay\n",
      );
    });

    await waitFor(() => {
      expect(result.current.visualValues).toMatchObject({
        autoUpdateEnabled: false,
        autoUpdateChannel: "dev",
        autoUpdateDockerImage: "registry.local/mirror/clirelay",
      });
    });

    act(() => {
      result.current.setVisualValues({
        autoUpdateEnabled: true,
        autoUpdateChannel: "dev",
        autoUpdateDockerImage: "registry.example.com/team/clirelay",
      });
    });

    await waitFor(() => {
      expect(result.current.applyVisualChangesToYaml("")).toContain("auto-update:");
      expect(result.current.applyVisualChangesToYaml("")).toContain("enabled: true");
      expect(result.current.applyVisualChangesToYaml("")).toContain("channel: dev");
      expect(result.current.applyVisualChangesToYaml("")).toContain(
        "docker-image: registry.example.com/team/clirelay",
      );
    });
  });

  test("exposes browser CORS origins as one origin per line", async () => {
    const onChange = renderEditor();

    const textarea = screen.getByRole("textbox", { name: /cors allowed origins/i });
    fireEvent.change(textarea, {
      target: {
        value: "chrome-extension://abcdefghijklmnop\nhttp://localhost:5173",
      },
    });

    expect(onChange).toHaveBeenLastCalledWith({
      corsAllowOriginsText: "chrome-extension://abcdefghijklmnop\nhttp://localhost:5173",
    });
  });

  test("loads and writes cors allow origins in config yaml", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        [
          "cors-allow-origins:",
          "  - https://admin.example.com",
          "  - chrome-extension://abcdefghijklmnop",
        ].join("\n"),
      );
    });

    await waitFor(() => {
      expect(result.current.visualValues.corsAllowOriginsText).toBe(
        "https://admin.example.com\nchrome-extension://abcdefghijklmnop",
      );
    });

    act(() => {
      result.current.setVisualValues({
        corsAllowOriginsText:
          " https://plugin.example \n\nchrome-extension://abcdefghijklmnop\nhttps://plugin.example",
      });
    });

    await waitFor(() => {
      const nextYaml = result.current.applyVisualChangesToYaml("");
      expect(nextYaml).toContain("cors-allow-origins:");
      expect(nextYaml).toContain("- https://plugin.example");
      expect(nextYaml).toContain("- chrome-extension://abcdefghijklmnop");
      expect(nextYaml.match(/https:\/\/plugin\.example/g)).toHaveLength(1);
    });
  });

  test("loads and writes session-sticky routing strategy in config yaml", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        [
          "routing:",
          "  strategy: session-sticky",
          "  channel-groups:",
          "    - name: sticky-pool",
          "      strategy: session-sticky",
          "      match:",
          "        channels:",
          "          - Main Codex",
        ].join("\n"),
      );
    });

    await waitFor(() => {
      expect(result.current.visualValues.routingStrategy).toBe("session-sticky");
      expect(result.current.visualValues.routingChannelGroups[0]?.strategy).toBe("session-sticky");
    });

    await waitFor(() => {
      const nextYaml = result.current.applyVisualChangesToYaml("");
      expect(nextYaml).toContain("strategy: session-sticky");
      expect(nextYaml).toContain("name: sticky-pool");
    });
  });

  test("loads payload rules from runtime config when YAML was cleaned after DB migration", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml("port: 8318\nlogging-to-file: true\n", {
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

    await waitFor(() => {
      expect(result.current.visualValues.payloadOverrideRules).toHaveLength(1);
      expect(result.current.visualValues.payloadOverrideRules[0]?.models[0]).toMatchObject({
        name: "gpt-5.4",
        protocol: "codex",
      });
      expect(result.current.visualValues.payloadOverrideRules[0]?.params[0]).toMatchObject({
        path: "service_tier",
        value: "priority",
      });
    });
  });

  test("writes empty payload marker when DB-backed payload rules are cleared visually", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml("port: 8318\n", {
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

    await waitFor(() => {
      expect(result.current.visualValues.payloadOverrideRules).toHaveLength(1);
    });

    act(() => {
      result.current.setVisualValues({ payloadOverrideRules: [] });
    });

    await waitFor(() => {
      const nextYaml = result.current.applyVisualChangesToYaml("port: 8318\n");
      expect(nextYaml).toContain("payload: {}\n");
      expect(nextYaml).not.toContain("service_tier");
    });
  });
  test("applies the low-resource production profile as one staged visual change", async () => {
    const onChange = renderEditor();

    await userEvent.click(screen.getByRole("button", { name: /apply recommended values/i }));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        debug: false,
        requestLog: false,
        loggingToFile: false,
        usageStatisticsEnabled: false,
        logsMaxTotalSizeMb: "128",
        errorLogsMaxFiles: "10",
        systemStatsCacheSeconds: "60",
        systemStatsWebSocketMaxAgeSeconds: "300",
        requestLogStorage: expect.objectContaining({
          storeContent: false,
          retentionDays: "7",
          contentRetentionDays: "3",
          cleanupEnabled: true,
          cleanupIntervalMinutes: "60",
          maxRows: "100000",
          maxMetadataSizeMb: "256",
          maxTotalSizeMb: "128",
        }),
      }),
    );
  });

  test("loads and writes request-log storage and monitoring cache settings", async () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        [
          "request-log: true",
          "error-logs-max-files: 7",
          "system-stats-cache-seconds: 90",
          "system-stats-websocket-max-age-seconds: 600",
          "request-log-storage:",
          "  store-content: true",
          "  content-retention-days: 14",
          "  cleanup-interval-minutes: 720",
          "  max-total-size-mb: 512",
        ].join("\n"),
      );
    });

    await waitFor(() => {
      expect(result.current.visualValues).toMatchObject({
        requestLog: true,
        errorLogsMaxFiles: "7",
        systemStatsCacheSeconds: "90",
        systemStatsWebSocketMaxAgeSeconds: "600",
        requestLogStorage: {
          storeContent: true,
          retentionDays: "7",
          contentRetentionDays: "14",
          cleanupEnabled: true,
          cleanupIntervalMinutes: "720",
          maxRows: "100000",
          maxMetadataSizeMb: "256",
          maxTotalSizeMb: "512",
        },
      });
    });

    act(() => {
      result.current.setVisualValues({
        requestLog: false,
        systemStatsCacheSeconds: "60",
        systemStatsWebSocketMaxAgeSeconds: "300",
        requestLogStorage: {
          ...result.current.visualValues.requestLogStorage,
          storeContent: false,
          maxTotalSizeMb: "256",
        },
      });
    });

    await waitFor(() => {
      const yaml = result.current.applyVisualChangesToYaml("");
      expect(yaml).toContain("system-stats-cache-seconds: 60");
      expect(yaml).toContain("system-stats-websocket-max-age-seconds: 300");
      expect(yaml).toContain("max-total-size-mb: 256");
      expect(yaml).not.toContain("vacuum-on-cleanup");
      expect(yaml).not.toContain("request-log: true");
    });
  });
});
