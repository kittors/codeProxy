import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { AnimatedNumber } from "../AnimatedNumber";

describe("AnimatedNumber (Satin NumberFlow React 19 regression)", () => {
  test("preserves mounted NumberFlow digits across React 19 re-renders and value updates", () => {
    const format = (n: number) => `${n.toFixed(1)}%`;
    const { container, rerender } = render(<AnimatedNumber value={0} format={format} />);

    const nf = () => container.querySelector(".sn-nf");
    expect(nf()).not.toBeNull();
    expect(nf()?.querySelectorAll(".sn-nf-d").length).toBeGreaterThanOrEqual(2);
    expect(nf()?.getAttribute("aria-label")).toBe("0.0%");

    // 模拟父组件在拿到异步数据后触发的 React 19 重渲染与值变化：
    // 若 wrap() 未固定 dangerouslySetInnerHTML 对象引用，React 19 会把 .sn-nf 清成空节点。
    rerender(<AnimatedNumber value={98.8} format={format} />);
    expect(nf()?.querySelectorAll(".sn-nf-d").length).toBeGreaterThanOrEqual(3);
    expect(nf()?.getAttribute("aria-label")).toBe("98.8%");
    expect(nf()?.querySelector(".sn-nf-sr")?.textContent).toBe("98.8%");

    // 同值再次重渲染（如页面切换主题、打开抽屉），仍不能清空数位节点。
    rerender(<AnimatedNumber value={98.8} format={format} className="text-sn-label" />);
    expect(nf()?.querySelectorAll(".sn-nf-d").length).toBeGreaterThanOrEqual(3);
    expect(nf()?.getAttribute("aria-label")).toBe("98.8%");
  });
});
