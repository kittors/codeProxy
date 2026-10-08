import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { QuotaBar, resolveQuotaVisualTone } from "../QuotaBar";

describe("QuotaBar", () => {
  test("draws a thick solid fill whose width tracks the percent and grows in on first paint", () => {
    render(<QuotaBar label="Code: 5h" percent={64} detailText="1d 23h" />);

    const fill = screen.getByTestId("quota-bar-fill");
    expect(fill).toHaveStyle({ width: "64%" });
    // 健康用强调色实心填充；轨道中性，填了多少一眼能和剩下的分开。
    expect(fill).toHaveClass("bg-accent");
    expect(fill.className).not.toContain("gradient");
    // 8px 粗，多张卡并排时能按长短比较（以前 4px 细线读起来只是一道颜色）。
    expect(fill.parentElement).toHaveClass("bg-track", "rounded-full", "h-2");
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

  test("keeps the ring colour in step with the bar for list-view chips", () => {
    expect(resolveQuotaVisualTone(90).fillHex).toBe("#2a6ee8");
    expect(resolveQuotaVisualTone(40).fillHex).toBe("#f59e0b");
    expect(resolveQuotaVisualTone(10).fillHex).toBe("#f43f5e");
  });
});
