import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MonitorCard } from "@features/monitor-widgets";

describe("MonitorCard", () => {
  test("loading overlay does not intercept pointer events", () => {
    const { container } = render(
      <MonitorCard title="Chart" description="desc" loading>
        <button type="button">Legend Action</button>
      </MonitorCard>,
    );

    expect(screen.getByText("Legend Action")).toBeInTheDocument();
    const overlay = container.querySelector(".pointer-events-none");
    expect(overlay).toBeTruthy();
  });
});
