import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QuotaBar, resolveQuotaVisualTone } from "../QuotaBar";

describe("QuotaBar", () => {
  test("draws a thick fill whose width tracks the percent and grows in on first paint", () => {
    render(<QuotaBar label="Code: 5h" percent={64} detailText="1d 23h" />);

    const fill = screen.getByTestId("quota-bar-fill");
    expect(fill).toHaveStyle({ width: "64%" });
    // 健康段：语义进度条（默认）是绿色渐变 + 同色淡轨道；强调色进度条是强调色实心 + 中性轨道。
    // 两套类名都在元素上，由 <html data-bars> 决定哪套生效。
    expect(fill).toHaveClass(
      "bg-accent",
      "bar-semantic:bg-gradient-to-r",
      "bar-semantic:from-emerald-400",
      "bar-semantic:dark:from-emerald-500",
    );
    expect(fill.parentElement).toHaveClass("bg-track", "bar-semantic:bg-emerald-500/12");
    // 粗细由外观设置的 --cp-bar-h 决定（默认 8px），多张卡并排时能按长短比较。
    expect(fill.parentElement).toHaveClass("rounded-full", "h-bar");
    // 首次出现从 0 长到实际值，之后宽度变化走过渡；减少动态效果时都关掉。
    expect(fill.className).toContain("motion-safe:animate-[quota-bar-grow");
    expect(fill).toHaveClass("transition-[width]", "motion-reduce:transition-none");
    expect(screen.getByText("64%")).toHaveClass("text-ink");
  });

  test("takes amber and red only once a window needs attention", () => {
    const { rerender } = render(<QuotaBar label="Weekly" percent={31} />);
    expect(screen.getByTestId("quota-bar-fill")).toHaveClass("bg-amber-500");
    expect(screen.getByText("31%")).toHaveClass("text-amber-700");

    rerender(<QuotaBar label="Weekly" percent={5} />);
    expect(screen.getByTestId("quota-bar-fill")).toHaveClass("bg-rose-500");
    expect(screen.getByText("5%")).toHaveClass("text-rose-600");
  });

  test("leaves an empty track for 0% and for an unknown percent", () => {
    const { rerender } = render(<QuotaBar label="Weekly" percent={0} />);
    expect(screen.queryByTestId("quota-bar-fill")).toBeNull();
    expect(screen.getByText("0%")).toHaveClass("text-rose-600");

    rerender(<QuotaBar label="Weekly" percent={null} />);
    expect(screen.queryByTestId("quota-bar-fill")).toBeNull();
    expect(screen.getByText("--")).toHaveClass("text-ink-3");
  });

  test("uses the thinner bar when compact", () => {
    render(<QuotaBar label="Weekly" percent={80} compact />);
    expect(screen.getByTestId("quota-bar-fill").parentElement).toHaveClass("h-bar-sm");
  });

  test("keeps the ring colour in step with the bar for list-view chips", () => {
    // 健康段跟随外观开关（语义绿 / 强调色），由 CSS 变量决定，内联渐变里也能用。
    expect(resolveQuotaVisualTone(90).fillHex).toBe("var(--cp-bar-healthy)");
    expect(resolveQuotaVisualTone(40).fillHex).toBe("#f59e0b");
    expect(resolveQuotaVisualTone(10).fillHex).toBe("#f43f5e");
  });
});
