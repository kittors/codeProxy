import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "../Button";

describe("Button", () => {
  test("uses icon-only sizing for a single non-text child", () => {
    render(
      <Button aria-label="refresh">
        <span data-testid="icon" />
      </Button>,
    );

    const button = screen.getByRole("button", { name: "refresh" });
    // Default md icon-only: h-9 w-9 px-0
    expect(button.className).toMatch(/\bw-9\b/);
    expect(button.className).toMatch(/\bpx-0\b/);
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
    // Text size (md): h-10 px-4 — not the square icon-only w-9 px-0.
    expect(button.className).toMatch(/\bpx-4\b/);
    expect(button.className).not.toMatch(/\bw-9\b/);
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
    expect(button.className).toMatch(/\bpx-4\b/);
    expect(button.className).not.toMatch(/\bw-9\b/);
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
    expect(button.className).toMatch(/\bpx-4\b/);
    expect(button.className).not.toMatch(/\bw-9\b/);
  });
});
