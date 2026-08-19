import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { OverflowTooltip } from "../Tooltip";

// jsdom has no layout, so overflow has to be dictated element by element.
const mockMetrics = (metrics: { scrollWidth: number; clientWidth: number }) => {
  const originals = {
    scrollWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth"),
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  };
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => metrics.scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => metrics.clientWidth,
  });
  return () => {
    if (originals.scrollWidth) {
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", originals.scrollWidth);
    }
    if (originals.clientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originals.clientWidth);
    }
  };
};

describe("OverflowTooltip", () => {
  let restore: (() => void) | null = null;

  afterEach(() => {
    restore?.();
    restore = null;
  });

  test("stays closed for a 1px rounding overflow", async () => {
    // A 188.4px label in a 188px box: scrollWidth rounds up to 189 while the text
    // still renders in full. Opening here repeats the visible text for no reason.
    restore = mockMetrics({ scrollWidth: 189, clientWidth: 188 });
    const user = userEvent.setup();

    render(
      <OverflowTooltip content="ollama/deepseek-v4-flash:0731">
        <span>ollama/deepseek-v4-flash:0731</span>
      </OverflowTooltip>,
    );

    await user.hover(screen.getByText("ollama/deepseek-v4-flash:0731"));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test("still opens when the text is genuinely truncated", async () => {
    restore = mockMetrics({ scrollWidth: 320, clientWidth: 188 });
    const user = userEvent.setup();

    render(
      <OverflowTooltip content="ollama/deepseek-v4-flash:0731">
        <span>ollama/deepseek-v4-flash:0731</span>
      </OverflowTooltip>,
    );

    await user.hover(screen.getByText("ollama/deepseek-v4-flash:0731"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "ollama/deepseek-v4-flash:0731",
    );
  });
});
