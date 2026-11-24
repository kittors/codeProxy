import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  test("uses Satin icon-only styling (.sn-ibtn) for a single non-text child", () => {
    render(
      <Button aria-label="refresh">
        <span data-testid="icon" />
      </Button>,
    );

    const button = screen.getByRole("button", { name: "refresh" });
    expect(button.className).toMatch(/\bsn-btn\b/);
    expect(button.className).toMatch(/\bsn-ibtn\b/);
  });

  test("does not treat Fragment-wrapped icon+label as icon-only", () => {
    render(
      <Button variant="primary">
        <>
          <span data-testid="spinner" />
          保存中...
        </>
      </Button>,
    );

    const button = screen.getByRole("button", { name: "保存中..." });
    expect(button.className).toMatch(/\bsn-btn\b/);
    expect(button.className).toMatch(/\bsn-primary\b/);
    expect(button.className).not.toMatch(/\bsn-ibtn\b/);
    expect(button).toHaveTextContent("保存中...");
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  test("keeps text sizing for icon and label as sibling children", () => {
    render(
      <Button variant="primary">
        <span data-testid="spinner" />
        保存中...
      </Button>,
    );

    const button = screen.getByRole("button", { name: "保存中..." });
    expect(button.className).toMatch(/\bsn-btn\b/);
    expect(button.className).not.toMatch(/\bsn-ibtn\b/);
  });

  test("flattens nested Fragments before icon-only detection", () => {
    render(
      <Button variant="primary">
        <>
          <>
            <span data-testid="spinner" />
          </>
          保存中...
        </>
      </Button>,
    );

    const button = screen.getByRole("button", { name: "保存中..." });
    expect(button.className).toMatch(/\bsn-btn\b/);
    expect(button.className).not.toMatch(/\bsn-ibtn\b/);
  });
});
