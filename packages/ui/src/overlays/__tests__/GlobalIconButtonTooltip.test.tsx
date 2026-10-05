import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { GlobalIconButtonTooltip } from "../Tooltip";

describe("GlobalIconButtonTooltip", () => {
  test("names icon-only buttons from aria-label", () => {
    render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="Refresh">
          <svg aria-hidden="true" />
        </button>
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Refresh");
  });

  test("stays quiet for buttons whose text is already visible", () => {
    render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="Save changes">
          Save
        </button>
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("ignores empty backdrop buttons that only carry an aria-label", () => {
    render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="Close" data-testid="backdrop" />
      </>,
    );

    fireEvent.mouseOver(screen.getByTestId("backdrop"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("an explicit data-tooltip wins over faded-out text (collapsed sidebar rows)", () => {
    render(
      <>
        <GlobalIconButtonTooltip />
        <a href="/dashboard" data-tooltip="Dashboard">
          <svg aria-hidden="true" />
          <span style={{ opacity: 0 }}>Dashboard</span>
        </a>
        <a href="/monitor">Monitor</a>
      </>,
    );

    fireEvent.mouseOver(screen.getByRole("link", { name: "Dashboard" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Dashboard");

    // 没写 data-tooltip 的链接从不参与。
    fireEvent.mouseOut(screen.getByRole("link", { name: "Dashboard" }));
    fireEvent.mouseOver(screen.getByRole("link", { name: "Monitor" }));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
