import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  resolveStickyOverlayHeights,
  StickyBoundaries,
  StickyRails,
  syncStickyOverlayHeights,
  useObservedHeight,
} from "../StickyOverlays";

const viewport = { clientHeight: 600, headerHeight: 48, bottomInset: 0 };

describe("resolveStickyOverlayHeights", () => {
  test("stops at the last row when the table is shorter than the viewport", () => {
    // The reported bug: 6 rows in a tall card left the actions-column shadow
    // hanging over the empty area below them.
    expect(resolveStickyOverlayHeights({ ...viewport, tableHeight: 300, scrollTop: 0 })).toEqual({
      boundary: 300,
      rail: 252,
    });
  });

  test("fills the viewport while the table runs past it", () => {
    expect(resolveStickyOverlayHeights({ ...viewport, tableHeight: 2000, scrollTop: 500 })).toEqual(
      { boundary: 600, rail: 552 },
    );
  });

  test("stays off the footer below the table when scrolled to the end", () => {
    // scrollHeight 2040 = table 2000 + a 40px "all records loaded" footer.
    expect(
      resolveStickyOverlayHeights({ ...viewport, tableHeight: 2000, scrollTop: 1440 }),
    ).toEqual({ boundary: 560, rail: 512 });
  });

  test("keeps clear of the horizontal scrollbar", () => {
    expect(
      resolveStickyOverlayHeights({
        ...viewport,
        bottomInset: 14,
        tableHeight: 2000,
        scrollTop: 0,
      }),
    ).toEqual({ boundary: 586, rail: 538 });
  });

  test("falls back to the full viewport until the table is measured", () => {
    expect(resolveStickyOverlayHeights({ ...viewport, tableHeight: 0, scrollTop: 0 })).toEqual({
      boundary: 600,
      rail: 552,
    });
  });

  test("never goes negative", () => {
    expect(
      resolveStickyOverlayHeights({ ...viewport, headerHeight: 48, tableHeight: 30, scrollTop: 0 }),
    ).toEqual({ boundary: 30, rail: 0 });
  });
});

describe("syncStickyOverlayHeights", () => {
  test("writes the live heights onto whichever overlays are rendered", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-vt-sticky-end-rail style="height: 552px"></div>
      <div data-vt-sticky-end-boundary style="height: 600px"></div>`;

    syncStickyOverlayHeights(root, { ...viewport, tableHeight: 2000, scrollTop: 1440 });

    expect(root.querySelector<HTMLElement>("[data-vt-sticky-end-rail]")?.style.height).toBe(
      "512px",
    );
    expect(root.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]")?.style.height).toBe(
      "560px",
    );
  });
});

describe("StickyRails / StickyBoundaries", () => {
  test("render only the edges that have fixed columns", () => {
    const { container } = render(
      <>
        <StickyRails startWidth={0} endWidth={120} endLeft={880} top={48} height={252} />
        <StickyBoundaries
          startWidth={0}
          endWidth={120}
          startLeft={0}
          endLeft={852}
          height={300}
          startOpacity={0}
          endOpacity={1}
        />
      </>,
    );

    expect(container.querySelector("[data-vt-sticky-start-rail]")).toBeNull();
    expect(container.querySelector("[data-vt-sticky-start-boundary]")).toBeNull();
    const rail = container.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
    const boundary = container.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
    expect(rail?.style.height).toBe("252px");
    expect(rail?.style.left).toBe("880px");
    expect(boundary?.style.height).toBe("300px");
    expect(boundary?.style.opacity).toBe("1");
  });

  test("render nothing without height", () => {
    const { container } = render(
      <>
        <StickyRails startWidth={40} endWidth={120} endLeft={880} top={48} height={0} />
        <StickyBoundaries
          startWidth={40}
          endWidth={120}
          startLeft={40}
          endLeft={852}
          height={0}
          startOpacity={1}
          endOpacity={1}
        />
      </>,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("useObservedHeight", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  test("follows the element as it resizes", () => {
    let notify: () => void = () => undefined;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        notify = () => callback([], this as unknown as ResizeObserver);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;

    let elementHeight = 0;
    function Probe() {
      const ref = useRef<HTMLDivElement | null>(null);
      const height = useObservedHeight(ref);
      return (
        <div
          ref={(node) => {
            ref.current = node;
            if (node) {
              Object.defineProperty(node, "offsetHeight", {
                configurable: true,
                get: () => elementHeight,
              });
            }
          }}
          data-height={height}
        />
      );
    }

    const { container } = render(<Probe />);
    const probe = container.firstElementChild as HTMLElement;
    expect(probe.dataset.height).toBe("0");

    elementHeight = 287.4;
    act(() => notify());
    expect(probe.dataset.height).toBe("288");
  });
});
