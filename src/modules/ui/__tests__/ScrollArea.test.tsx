import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ScrollArea } from "@/modules/ui/ScrollArea";

function setScrollMetrics(
  element: HTMLDivElement,
  metrics: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop?: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    scrollTop: { configurable: true, writable: true, value: metrics.scrollTop ?? 0 },
  });
}

describe("ScrollArea", () => {
  test("uses the hidden-native-scrollbar viewport", () => {
    const { container } = render(
      <ScrollArea data-testid="demo-scroll-area" scrollbarVisibility="always">
        <div>Content</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector("[data-scroll-area-viewport]");
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveClass("table-scrollbar");
    expect(viewport).toHaveAttribute("data-scrollbar-visibility", "always");
  });

  test("renders a visible vertical scrollbar only when content overflows", async () => {
    const { container } = render(
      <ScrollArea className="h-[120px]" scrollbarVisibility="always">
        <div style={{ height: 420 }}>Tall content</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector(
      "[data-scroll-area-viewport]",
    ) as HTMLDivElement | null;
    expect(viewport).not.toBeNull();

    setScrollMetrics(viewport!, {
      clientHeight: 120,
      scrollHeight: 420,
      scrollTop: 24,
    });
    window.dispatchEvent(new Event("resize"));
    fireEvent.scroll(viewport!);

    await waitFor(() => {
      const scrollbar = container.querySelector('[data-scroll-area-scrollbar="y"]');
      const thumb = scrollbar?.querySelector('[role="presentation"]') as HTMLDivElement | null;

      expect(scrollbar).not.toBeNull();
      expect(scrollbar).toHaveClass("opacity-100", "right-0");
      expect(thumb).not.toBeNull();
      expect(thumb!.style.height).not.toBe("");
      expect(thumb!.style.top).not.toBe("");
    });
  });

  test("does not render a custom scrollbar without overflow", async () => {
    const { container } = render(
      <ScrollArea className="h-[120px]" scrollbarVisibility="always">
        <div>Short content</div>
      </ScrollArea>,
    );

    const viewport = container.querySelector(
      "[data-scroll-area-viewport]",
    ) as HTMLDivElement | null;
    expect(viewport).not.toBeNull();

    setScrollMetrics(viewport!, {
      clientHeight: 120,
      scrollHeight: 120,
    });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(container.querySelector('[data-scroll-area-scrollbar="y"]')).toBeNull();
    });
  });
});
