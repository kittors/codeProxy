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
  test("shows track-hover scrollbars for the whole area and hides on pointer leave", () => {
    render(
      <ScrollArea scrollbarVisibility="track-hover">
        <div>content</div>
      </ScrollArea>,
    );

    const root = document.querySelector<HTMLElement>("[data-scroll-area-root]");
    const viewport = document.querySelector<HTMLElement>("[data-scroll-area-viewport]");
    expect(root).not.toBeNull();
    expect(viewport).not.toBeNull();

    setScrollMetrics(viewport!);
    fireEvent.scroll(viewport!);

    const scrollbar = document.querySelector<HTMLElement>("[data-scroll-area-scrollbar='y']");
    expect(scrollbar).not.toBeNull();
    expect(scrollbar!).toHaveClass("opacity-100", "group-hover:opacity-100");
    expect(scrollbar!).not.toHaveClass("group-focus-within:opacity-100");

    fireEvent.pointerLeave(root!);

    expect(scrollbar!).toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(scrollbar!).not.toHaveClass("group-focus-within:opacity-100");
  });
});
