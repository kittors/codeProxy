import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ScrollArea } from "../ScrollArea";

function setScrollMetrics(element: HTMLElement) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 300 },
    scrollTop: { configurable: true, value: 20, writable: true },
  });
}

describe("ScrollArea", () => {
  test("delegates scrollbar chrome to Satin native scrollArea and reflects bar mode and active scrolling", () => {
    render(
      <ScrollArea scrollbarVisibility="track-hover">
        <div>content</div>
      </ScrollArea>,
    );

    const root = document.querySelector<HTMLElement>("[data-scroll-area-root]");
    const viewport = document.querySelector<HTMLElement>("[data-scroll-area-viewport]");
    const satinBox = root?.querySelector<HTMLElement>(".sn-sa") ?? null;
    const satinBarY = satinBox?.querySelector<HTMLElement>(".sn-sa-bar.sn-y") ?? null;

    expect(root).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(satinBox).not.toBeNull();
    expect(satinBox!).toHaveAttribute("data-bar", "auto");
    expect(satinBox!).toHaveAttribute("data-over", "contain");
    expect(viewport!).toHaveClass("sn-sa-vp");
    expect(satinBarY).not.toBeNull();

    setScrollMetrics(viewport!);
    fireEvent.scroll(viewport!);

    expect(satinBox!).toHaveClass("sn-active");
  });

  test("fades the viewport edges by default and drops the mask when edgeFade is turned off", () => {
    const { rerender } = render(
      <ScrollArea>
        <div>content</div>
      </ScrollArea>,
    );
    const viewport = document.querySelector<HTMLElement>("[data-scroll-area-viewport]")!;
    setScrollMetrics(viewport);
    fireEvent.scroll(viewport);
    // 滚到中间：上下都还有内容，两个标记同时在。
    expect(viewport).toHaveAttribute("data-scroll-fade", "y");
    expect(viewport).toHaveAttribute("data-scroll-more-top");
    expect(viewport).toHaveAttribute("data-scroll-more-bottom");
    expect(viewport.style.getPropertyValue("--scroll-fade-top")).toBe("20px");
    expect(viewport.style.getPropertyValue("--scroll-fade-bottom")).toBe("24px");

    // 侧边栏收起后有 fixed 定位的悬停浮层，遮罩必须整个撤掉，否则浮层会被裁掉。
    rerender(
      <ScrollArea edgeFade={false}>
        <div>content</div>
      </ScrollArea>,
    );
    expect(viewport).not.toHaveAttribute("data-scroll-fade");
    expect(viewport).not.toHaveAttribute("data-scroll-more-top");
  });
});
