import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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

  test("shows automatic update settings and exposes main/dev source branches", async () => {
    const onChange = renderEditor();

    const toggle = screen.getByRole("switch", { name: /automatic update checks/i });
    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ autoUpdateEnabled: false });

    const select = screen.getByRole("combobox", { name: /update source branch/i });
    await userEvent.click(select);
    expect(screen.queryByRole("option", { name: /auto-detect/i })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("option", { name: /development/i }));

    expect(onChange).toHaveBeenCalledWith({ autoUpdateChannel: "dev" });
  });

  test("exposes custom docker image repository with a risk warning", async () => {
    const onChange = renderEditor();

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
        requestLogStorage: expect.objectContaining({
          storeContent: false,
          maxTotalSizeMb: "256",
          vacuumOnCleanup: false,
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
          "request-log-storage:",
          "  store-content: true",
          "  content-retention-days: 14",
          "  cleanup-interval-minutes: 720",
          "  max-total-size-mb: 512",
          "  vacuum-on-cleanup: false",
        ].join("\n"),
      );
    });

    await waitFor(() => {
      expect(result.current.visualValues).toMatchObject({
        requestLog: true,
        errorLogsMaxFiles: "7",
        systemStatsCacheSeconds: "90",
        requestLogStorage: {
          storeContent: true,
          contentRetentionDays: "14",
          cleanupIntervalMinutes: "720",
          maxTotalSizeMb: "512",
          vacuumOnCleanup: false,
        },
      });
    });

    act(() => {
      result.current.setVisualValues({
        requestLog: false,
        systemStatsCacheSeconds: "60",
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
      expect(yaml).toContain("max-total-size-mb: 256");
      expect(yaml).toContain("vacuum-on-cleanup: false");
      expect(yaml).not.toContain("request-log: true");
    });
  });
});
