import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { ProviderModelChips } from "../ProviderModelChips";

describe("ProviderModelChips", () => {
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
});
