import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";
import { ProviderModelChips } from "../ProviderModelChips";

// jsdom reports every layout box as 0x0, so overflow-gated tooltips need explicit
// metrics to be exercised at all.
const mockChipOverflow = ({
  scrollWidth,
  clientWidth,
}: {
  scrollWidth: number;
  clientWidth: number;
}) => {
  const original = {
    scrollWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth"),
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
  };
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
  return () => {
    if (original.scrollWidth) {
      Object.defineProperty(HTMLElement.prototype, "scrollWidth", original.scrollWidth);
    }
    if (original.clientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", original.clientWidth);
    }
  };
};

describe("ProviderModelChips", () => {
  let restoreOverflow: (() => void) | null = null;

  afterEach(() => {
    restoreOverflow?.();
    restoreOverflow = null;
  });

  test("keeps overflow models behind the final summary chip", async () => {
    const user = userEvent.setup();
    const models = [
      { name: "model-1" },
      { name: "model-2" },
      { name: "model-3" },
      { name: "model-4" },
      { name: "model-5" },
      { name: "model-6" },
      { name: "model-7", alias: "mapped-7" },
      { name: "model-8" },
    ];

    render(<ProviderModelChips models={models} maxVisible={6} />);

    expect(screen.getByText("model-5")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.queryByText("model-6")).not.toBeInTheDocument();
    expect(screen.queryByText("model-7 → mapped-7")).not.toBeInTheDocument();

    await user.hover(screen.getByText("+3"));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("model-6");
    expect(tooltip).toHaveTextContent("model-7 => mapped-7");
    expect(tooltip).toHaveTextContent("model-8");
  });

  test("shows the full model mapping for visible truncated chips", async () => {
    const user = userEvent.setup();
    restoreOverflow = mockChipOverflow({ scrollWidth: 400, clientWidth: 120 });

    render(
      <ProviderModelChips
        models={[{ name: "very-long-upstream-model-name", alias: "very-long-downstream-alias" }]}
      />,
    );

    await user.hover(screen.getByText("very-long-upstream-model-name → very-long-downstream-alias"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "very-long-upstream-model-name => very-long-downstream-alias",
    );
  });

  test("stays quiet when the chip is fully visible", async () => {
    const user = userEvent.setup();
    // A chip that fits has nothing to add: repeating its text as a tooltip is the
    // "why is it showing me the alias again?" noise this component used to emit.
    restoreOverflow = mockChipOverflow({ scrollWidth: 120, clientWidth: 120 });

    render(<ProviderModelChips models={[{ name: "short-model", alias: "short-alias" }]} />);

    await user.hover(screen.getByText("short-model → short-alias"));

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
