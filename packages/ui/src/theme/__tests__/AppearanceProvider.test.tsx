import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { chartPalette } from "../../charts/chartTheme";
import { APPEARANCE_STORAGE_KEY, applyStylePreset, DEFAULT_APPEARANCE, serializeAppearance } from "../appearance";
import { AppearanceProvider, useAppearance } from "../AppearanceProvider";

function Probe() {
  const { settings, preset, update, applyPreset, reset } = useAppearance();
  return (
    <div>
      <span data-testid="preset">{preset}</span>
      <span data-testid="accent">{settings.accent}</span>
      <button type="button" onClick={() => applyPreset("quiet")}>
        quiet
      </button>
      <button type="button" onClick={() => update({ accent: "#ff00aa", barThickness: 12 })}>
        custom
      </button>
      <button type="button" onClick={reset}>
        reset
      </button>
    </div>
  );
}

const root = () => document.documentElement;

describe("AppearanceProvider", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    root().removeAttribute("style");
    for (const name of ["data-palette", "data-icons", "data-bars"]) root().removeAttribute(name);
  });

  test("writes the switches and variables to <html>, persists them, and clears what is no longer set", () => {
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    // 默认多彩：三个开关，没有行内变量。
    expect(root().dataset).toMatchObject({ palette: "colorful", icons: "colorful", bars: "semantic" });
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("");
    expect(chartPalette(false).primary).toBe("#6366f1");

    act(() => screen.getByText("quiet").click());
    expect(screen.getByTestId("preset")).toHaveTextContent("quiet");
    expect(root().dataset).toMatchObject({ palette: "quiet", icons: "mono", bars: "accent" });
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("#2a6ee8");
    // 图表配色在 canvas 里读不到 CSS 变量，Provider 同步更新了图表主题。
    expect(chartPalette(false).primary).toBe("#2a6ee8");
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? "{}").settings.palette).toBe("quiet");

    act(() => screen.getByText("custom").click());
    expect(screen.getByTestId("preset")).toHaveTextContent("custom");
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("#ff00aa");
    expect(root().style.getPropertyValue("--cp-pref-bar")).toBe("12");

    // 回到默认：之前写过的行内变量全部清掉，交还给样式表。
    act(() => screen.getByText("reset").click());
    expect(root().style.getPropertyValue("--cp-pref-accent")).toBe("");
    expect(root().style.getPropertyValue("--cp-pref-bar")).toBe("");
    expect(root().dataset.palette).toBe("colorful");
  });

  test("starts from what is stored and follows changes made in another tab", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearance(applyStylePreset(DEFAULT_APPEARANCE, "quiet")));
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    expect(screen.getByTestId("preset")).toHaveTextContent("quiet");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY, newValue: serializeAppearance(DEFAULT_APPEARANCE) }),
      );
    });
    expect(screen.getByTestId("preset")).toHaveTextContent("colorful");
    expect(root().dataset.palette).toBe("colorful");
  });

  test("components rendered without the provider still get the defaults", () => {
    render(<Probe />);
    expect(screen.getByTestId("preset")).toHaveTextContent("colorful");
    expect(screen.getByTestId("accent")).toHaveTextContent("ink");
  });
});
