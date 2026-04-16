import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "@/modules/ui/Button";

describe("Button", () => {
  test("uses a borderless pill surface with hover and active feedback by default", () => {
    render(<Button>Default</Button>);

    expect(screen.getByRole("button", { name: "Default" })).toHaveClass(
      "rounded-full",
      "border-0",
      "bg-[#EBEBEC]",
      "text-[#18181B]",
      "hover:bg-[#E4E4E7]",
      "active:translate-y-px",
      "active:scale-[0.98]",
    );
  });

  test("supports semantic variants and keeps danger as an error alias", () => {
    render(
      <>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="error">Error</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="success">Success</Button>
        <Button variant="warning">Warning</Button>
      </>,
    );

    expect(screen.getByRole("button", { name: "Primary" })).toHaveClass("bg-[#18181B]");
    expect(screen.getByRole("button", { name: "Secondary" })).toHaveClass(
      "border-0",
      "bg-[#EBEBEC]",
    );
    expect(screen.getByRole("button", { name: "Error" })).toHaveClass("bg-rose-600");
    expect(screen.getByRole("button", { name: "Danger" })).toHaveClass("bg-rose-600");
    expect(screen.getByRole("button", { name: "Success" })).toHaveClass("bg-emerald-600");
    expect(screen.getByRole("button", { name: "Warning" })).toHaveClass(
      "bg-amber-400",
      "text-amber-950",
    );
  });

  test("icon-only buttons keep the same pill system without borders", () => {
    render(
      <Button aria-label="Refresh" size="sm">
        <svg aria-hidden="true" />
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Refresh" })).toHaveClass(
      "h-8",
      "w-8",
      "rounded-full",
      "border-0",
      "bg-[#EBEBEC]",
    );
  });
});
