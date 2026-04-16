import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Card } from "@/modules/ui/Card";

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
});
