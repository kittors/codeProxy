import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { VisualConfigEditor } from "@/modules/config/visual/VisualConfigEditor";
import { DEFAULT_VISUAL_VALUES } from "@/modules/config/visual/types";
import { useVisualConfig } from "@/modules/config/visual/useVisualConfig";
import { ThemeProvider } from "@/modules/ui/ThemeProvider";

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
});
