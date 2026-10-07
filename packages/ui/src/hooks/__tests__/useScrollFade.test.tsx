import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useScrollFade } from "../useScrollFade";

/** jsdom 没有布局：用属性把滚动尺寸钉住，模拟「内容比容器高」。 */
function fakeLayout(node: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: clientHeight });
}

function Harness() {
  const fade = useScrollFade({ size: 20 });
  return (
    <div
      data-testid="scroller"
      ref={fade.ref}
      onScroll={fade.onScroll}
      style={fade.style}
      className={fade.className}
    >
      content
    </div>
  );
}

describe("useScrollFade", () => {
  test("fades only the edges that still have content beyond them", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    // 不溢出：不挂渐隐类，也就不会裁掉任何浮层。
    expect(scroller).not.toHaveClass("code-proxy-scroll-edge-fade");

    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });
    act(() => {
      scroller.scrollTop = 0;
      fireEvent.scroll(scroller);
    });
    expect(scroller).toHaveClass("code-proxy-scroll-edge-fade");
    expect(scroller.style.getPropertyValue("--scroll-fade-top")).toBe("0px");
    expect(scroller.style.getPropertyValue("--scroll-fade-bottom")).toBe("20px");

    act(() => {
      scroller.scrollTop = 200;
      fireEvent.scroll(scroller);
    });
    expect(scroller.style.getPropertyValue("--scroll-fade-top")).toBe("20px");
    expect(scroller.style.getPropertyValue("--scroll-fade-bottom")).toBe("20px");

    act(() => {
      scroller.scrollTop = 400;
      fireEvent.scroll(scroller);
    });
    expect(scroller.style.getPropertyValue("--scroll-fade-top")).toBe("20px");
    expect(scroller.style.getPropertyValue("--scroll-fade-bottom")).toBe("0px");
  });
});
