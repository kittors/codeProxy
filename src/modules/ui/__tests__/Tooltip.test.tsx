import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GlobalIconButtonTooltip, HoverTooltip, OverflowTooltip } from "@/modules/ui/Tooltip";

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};

const setTooltipSize = (width: number, height: number) => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: width });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
};

const mockAnchorRect = (rect: Partial<DOMRect>) => {
  const fullRect = {
    bottom: 120,
    height: 20,
    left: 100,
    right: 120,
    top: 100,
    width: 20,
    x: 100,
    y: 100,
    toJSON: () => undefined,
    ...rect,
  } as DOMRect;

  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(fullRect);
};

describe("HoverTooltip", () => {
  beforeEach(() => {
    setViewport(800, 600);
    setTooltipSize(80, 24);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("defaults to the bottom side of icon triggers with compact styling", async () => {
    mockAnchorRect({ left: 100, right: 120, top: 100, bottom: 120, width: 20, height: 20 });

    render(
      <HoverTooltip content="Refresh">
        <button type="button">Refresh</button>
      </HoverTooltip>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Refresh" }));

    expect(screen.getByRole("tooltip")).toHaveStyle({ left: "70px", top: "128px" });
    expect(screen.getByRole("tooltip")).toHaveClass("px-2", "py-1.5", "text-xs");
  });

  test("moves away from the bottom edge before clamping", async () => {
    mockAnchorRect({ left: 100, right: 132, top: 560, bottom: 592, width: 32, height: 32 });
    setTooltipSize(120, 24);

    render(
      <HoverTooltip content="Delete">
        <button type="button">Delete</button>
      </HoverTooltip>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("tooltip")).toHaveStyle({ left: "140px", top: "564px" });
  });

  test("adds the shared tooltip to unmanaged native icon buttons", async () => {
    mockAnchorRect({ left: 40, right: 72, top: 40, bottom: 72, width: 32, height: 32 });

    render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="Close">
          <svg aria-hidden="true" />
        </button>
      </>,
    );

    await userEvent.hover(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("tooltip")).toHaveTextContent("Close");
  });
});

describe("OverflowTooltip", () => {
  beforeEach(() => {
    setViewport(800, 600);
    setTooltipSize(180, 48);
    mockAnchorRect({ left: 100, right: 220, top: 100, bottom: 124, width: 120, height: 24 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("stays open when the pointer moves from the trigger into the tooltip", () => {
    vi.useFakeTimers();

    render(
      <OverflowTooltip content="Copyable full table cell value" className="block max-w-20 truncate">
        <span>Copyable full table cell value</span>
      </OverflowTooltip>,
    );

    const trigger = screen.getByText("Copyable full table cell value").parentElement!;
    Object.defineProperties(trigger, {
      clientWidth: { configurable: true, value: 80 },
      scrollWidth: { configurable: true, value: 260 },
    });

    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Copyable full table cell value");

    fireEvent.mouseLeave(trigger, { relatedTarget: tooltip });
    fireEvent.mouseEnter(tooltip, { relatedTarget: trigger });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByRole("tooltip")).toBe(tooltip);
    expect(tooltip).toHaveClass("pointer-events-auto", "select-text");

    fireEvent.mouseLeave(tooltip, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
