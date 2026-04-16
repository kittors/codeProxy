import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card } from "@/modules/ui/Card";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Card", () => {
  test("supports titleless content cards without rendering an empty heading", () => {
    render(
      <Card>
        <p>Metric content</p>
      </Card>,
    );

    expect(screen.getByText("Metric content")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  test("smoothly transitions card surface colors when the theme changes", () => {
    const source = readModule("modules/ui/Card.tsx");

    expect(source).toContain("motion-safe:transition-colors");
    expect(source).toContain("motion-safe:duration-200");
    expect(source).toContain("motion-safe:ease-out");
  });
});
