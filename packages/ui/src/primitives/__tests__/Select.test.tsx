import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Select } from "../Select";

const options = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

describe("Select", () => {
  test("stretches the default trigger to the container width", () => {
    render(<Select value="off" onChange={() => undefined} options={options} aria-label="Mode" />);

    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveClass("w-full");
  });

  test("keeps the chip variant compact", () => {
    render(
      <Select
        value="off"
        onChange={() => undefined}
        options={options}
        aria-label="Mode"
        variant="chip"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Mode" })).not.toHaveClass("w-full");
  });

  test("allows compact default-style selects in toolbars", () => {
    render(
      <Select
        value="off"
        onChange={() => undefined}
        options={options}
        aria-label="Mode"
        fullWidth={false}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Mode" })).not.toHaveClass("w-full");
  });
});
