import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { describe, expect, test } from "vitest";
import { requestScrollFadeMeasure } from "../scrollFadeDom";
import { useScrollFade } from "../useScrollFade";

function box(top: number, height: number, width = 300): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: width,
    width,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** jsdom 没有布局：用属性把滚动尺寸和盒子钉住，模拟「内容比容器高」。 */
function fakeLayout(
  node: HTMLElement,
  {
    scrollHeight,
    clientHeight,
    clientWidth = 300,
  }: { scrollHeight: number; clientHeight: number; clientWidth?: number },
) {
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(node, "clientWidth", { configurable: true, value: clientWidth });
  node.getBoundingClientRect = () => box(0, clientHeight);
}

function scrollTo(node: HTMLElement, top: number) {
  act(() => {
    node.scrollTop = top;
    fireEvent.scroll(node);
  });
}

const fadeVar = (node: HTMLElement, name: string) =>
  node.style.getPropertyValue(`--scroll-fade-${name}`);

function Harness({ enabled = true, children }: { enabled?: boolean; children?: ReactNode }) {
  const fade = useScrollFade({ size: 20, enabled });
  return (
    <div data-testid="scroller" ref={fade.ref}>
      {children ?? "content"}
    </div>
  );
}

describe("useScrollFade", () => {
  test("fades only the edges that still have content beyond them", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    // 不溢出：不挂遮罩，也就不会裁掉任何浮层。
    expect(scroller).not.toHaveAttribute("data-scroll-fade");

    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });
    scrollTo(scroller, 0);
    expect(scroller).toHaveAttribute("data-scroll-fade", "y");
    expect(scroller).not.toHaveAttribute("data-scroll-more-top");
    expect(scroller).toHaveAttribute("data-scroll-more-bottom");
    expect(fadeVar(scroller, "top")).toBe("0px");
    expect(fadeVar(scroller, "bottom")).toBe("20px");

    // 滚到中间：上面、下面都还有。
    scrollTo(scroller, 200);
    expect(scroller).toHaveAttribute("data-scroll-more-top");
    expect(scroller).toHaveAttribute("data-scroll-more-bottom");
    expect(fadeVar(scroller, "top")).toBe("20px");
    expect(fadeVar(scroller, "bottom")).toBe("20px");

    // 离底只差 8px：渐隐只剩 8px，不会把一整段本来就快看全的内容淡掉。
    scrollTo(scroller, 392);
    expect(fadeVar(scroller, "bottom")).toBe("8px");

    scrollTo(scroller, 400);
    expect(scroller).toHaveAttribute("data-scroll-more-top");
    expect(scroller).not.toHaveAttribute("data-scroll-more-bottom");
    expect(fadeVar(scroller, "top")).toBe("20px");
    expect(fadeVar(scroller, "bottom")).toBe("0px");
  });

  test("never fades a container that cannot scroll (overflow hidden)", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    // 子元素入场位移会让 scrollHeight 暂时大于 clientHeight；overflow: hidden 的盒子滚不动，
    // 挂上渐隐只会把边缘的内容抹掉。
    scroller.style.overflowY = "hidden";
    fakeLayout(scroller, { scrollHeight: 606, clientHeight: 600 });
    act(() => {
      fireEvent.scroll(scroller);
    });
    expect(scroller).not.toHaveAttribute("data-scroll-fade");

    scroller.style.overflowY = "auto";
    act(() => {
      fireEvent.scroll(scroller);
    });
    expect(scroller).toHaveAttribute("data-scroll-fade", "y");
  });

  test("drops every mark once disabled, so fixed overlays inside stop being clipped", () => {
    const { rerender } = render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });
    scrollTo(scroller, 200);
    expect(scroller).toHaveAttribute("data-scroll-fade", "y");

    rerender(<Harness enabled={false} />);
    expect(scroller).not.toHaveAttribute("data-scroll-fade");
    expect(scroller).not.toHaveAttribute("data-scroll-more-top");
    expect(scroller).not.toHaveAttribute("data-scroll-more-bottom");
    expect(scroller).not.toHaveAttribute("data-scroll-fade-host");
    expect(fadeVar(scroller, "top")).toBe("");
  });

  test("starts the top fade below a stuck sticky bar, and not before the bar sticks", () => {
    render(
      <Harness>
        <div data-testid="bar" data-scroll-fade-pin="top" style={{ position: "sticky", top: 0 }} />
        rows
      </Harness>,
    );
    const scroller = screen.getByTestId("scroller");
    const bar = screen.getByTestId("bar");
    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });

    bar.getBoundingClientRect = () => box(0, 40);
    scrollTo(scroller, 200);
    expect(fadeVar(scroller, "top-inset")).toBe("40px");

    // 栏还在原位（离顶 120px）：它跟着内容走，渐隐照常从顶边开始。
    bar.getBoundingClientRect = () => box(120, 40);
    scrollTo(scroller, 210);
    expect(fadeVar(scroller, "top-inset")).toBe("0px");
  });

  test("ignores sticky bars that belong to a nested scroll area", () => {
    render(
      <Harness>
        <div data-scroll-fade-host="">
          <div
            data-testid="inner-bar"
            data-scroll-fade-pin="top"
            style={{ position: "sticky", top: 0 }}
          />
        </div>
      </Harness>,
    );
    const scroller = screen.getByTestId("scroller");
    screen.getByTestId("inner-bar").getBoundingClientRect = () => box(0, 40);
    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });
    scrollTo(scroller, 200);
    expect(fadeVar(scroller, "top-inset")).toBe("0px");
  });

  test("leaves a classic scrollbar out of the fade", () => {
    render(<Harness />);
    const scroller = screen.getByTestId("scroller");
    // 盒子 300 宽、内容区 292 宽：右边 8px 是常驻滚动条。
    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200, clientWidth: 292 });
    scrollTo(scroller, 100);
    expect(fadeVar(scroller, "gutter")).toBe("8px");
  });

  test("re-measures when the content asks, e.g. after an entrance animation settles", () => {
    render(
      <Harness>
        <div data-testid="page">page</div>
      </Harness>,
    );
    const scroller = screen.getByTestId("scroller");
    // 入场位移让内容比容器高出 8px……
    fakeLayout(scroller, { scrollHeight: 208, clientHeight: 200 });
    scrollTo(scroller, 0);
    expect(scroller).toHaveAttribute("data-scroll-more-bottom");

    // ……动画结束后回到原位。transform 不触发 ResizeObserver，靠页面发的事件补量一次。
    fakeLayout(scroller, { scrollHeight: 200, clientHeight: 200 });
    act(() => requestScrollFadeMeasure(screen.getByTestId("page")));
    expect(scroller).not.toHaveAttribute("data-scroll-fade");
  });

  test("can paint the mask on a wrapper so controls outside it stay crisp", () => {
    function HostHarness() {
      const host = useRef<HTMLDivElement | null>(null);
      const fade = useScrollFade({ size: 20, host });
      return (
        <div data-testid="host" ref={host}>
          <div data-testid="scroller" ref={fade.ref}>
            rows
          </div>
        </div>
      );
    }
    render(<HostHarness />);
    const host = screen.getByTestId("host");
    const scroller = screen.getByTestId("scroller");
    host.getBoundingClientRect = () => box(0, 200);
    fakeLayout(scroller, { scrollHeight: 600, clientHeight: 200 });
    scrollTo(scroller, 200);
    expect(host).toHaveAttribute("data-scroll-fade", "y");
    expect(host).toHaveAttribute("data-scroll-more-top");
    expect(host).toHaveAttribute("data-scroll-more-bottom");
    expect(scroller).not.toHaveAttribute("data-scroll-fade");
  });
});
