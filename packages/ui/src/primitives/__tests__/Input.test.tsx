import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TextInput } from "../Input";

describe("TextInput", () => {
  test("moves width and layout classes onto the outer .sn-ib wrapper when adornments are present", () => {
    render(
      <TextInput
        aria-label="Search models"
        className="sm:w-64 shrink-0 font-mono"
        startAdornment={<span data-testid="pre-icon" />}
        endAdornment={<button type="button" aria-label="clear" />}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Search models" });
    const wrapper = input.parentElement;
    expect(wrapper).toHaveClass("sn-ib", "sn-has-pre", "sn-has-post", "w-full", "sm:w-64", "shrink-0");
    expect(input).toHaveClass("sn-input", "w-full", "font-mono");
    expect(input).not.toHaveClass("sm:w-64", "shrink-0");
  });

  test("omits default w-full on .sn-ib when an explicit bare width class is provided", () => {
    render(
      <TextInput
        aria-label="Compact search"
        className="!w-48"
        startAdornment={<span data-testid="pre-icon" />}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Compact search" });
    const wrapper = input.parentElement;
    expect(wrapper).toHaveClass("sn-ib", "!w-48");
    expect(wrapper).not.toHaveClass("w-full");
  });

  test("strips bare horizontal padding utilities when adornments are present so icons never overlap text", () => {
    render(
      <TextInput
        aria-label="Username"
        size="xl"
        className="rounded-full px-5 pl-4"
        startAdornment={<span data-testid="pre-icon" />}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Username" });
    expect(input).toHaveClass("sn-input", "sn-xl", "rounded-full");
    expect(input).not.toHaveClass("px-5", "pl-4");
  });
});
