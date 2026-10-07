import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "../Tabs";

describe("TabsList", () => {
  test("contains horizontal overscroll so parent/viewport does not rubber-band", () => {
    render(
      <Tabs value="a" onValueChange={() => {}}>
        <TabsList>
          <TabsTrigger value="a">Alpha</TabsTrigger>
          <TabsTrigger value="b">Beta</TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const tablist = screen.getByRole("tablist");
    expect(tablist).toHaveClass("overflow-x-auto");
    expect(tablist).toHaveClass("overscroll-x-contain");
  });

  test("fades the ends of the strip only while the tabs overflow it", () => {
    const onScroll = vi.fn();
    render(
      <Tabs value="a" onValueChange={() => {}}>
        <TabsList onScroll={onScroll} style={{ marginTop: 4 }}>
          <TabsTrigger value="a">Alpha</TabsTrigger>
          <TabsTrigger value="b">Beta</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const tablist = screen.getByRole("tablist");
    // 放得下：不挂遮罩，桌面宽度下的标签条和以前一样。
    expect(tablist).not.toHaveClass("code-proxy-scroll-edge-fade-x");

    // jsdom 没有布局：钉住滚动尺寸，模拟窄屏上标签比条长。
    Object.defineProperty(tablist, "scrollWidth", { configurable: true, value: 600 });
    Object.defineProperty(tablist, "clientWidth", { configurable: true, value: 300 });
    act(() => {
      tablist.scrollLeft = 0;
      fireEvent.scroll(tablist);
    });
    expect(tablist).toHaveClass("code-proxy-scroll-edge-fade-x");
    expect(tablist.style.getPropertyValue("--scroll-fade-left")).toBe("0px");
    expect(tablist.style.getPropertyValue("--scroll-fade-right")).toBe("20px");

    act(() => {
      tablist.scrollLeft = 300;
      fireEvent.scroll(tablist);
    });
    expect(tablist.style.getPropertyValue("--scroll-fade-left")).toBe("20px");
    expect(tablist.style.getPropertyValue("--scroll-fade-right")).toBe("0px");
    // 调用方的 style 与 onScroll 照常生效。
    expect(tablist.style.marginTop).toBe("4px");
    expect(onScroll).toHaveBeenCalled();
  });
});
