import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  // 点按会让按钮拿到焦点；按焦点弹回来的提示是点之前的名字（展开 / 收起切换后仍写「展开详情」）。
  test("a pointer click does not bring the tooltip back through focus", () => {
    render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="展开详情">
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    const button = screen.getByRole("button", { name: "展开详情" });
    fireEvent.mouseOver(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("展开详情");
    fireEvent.pointerDown(button);
    fireEvent.focusIn(button);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // 之后用键盘把焦点移回来，照常弹提示。
    fireEvent.focusOut(button);
    fireEvent.keyDown(document.body, { key: "Tab" });
    fireEvent.focusIn(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("展开详情");
  });

  test("an open tooltip follows a label that changes underneath it", async () => {
    const { rerender } = render(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="展开详情" aria-expanded={false}>
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    fireEvent.mouseOver(screen.getByRole("button", { name: "展开详情" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("展开详情");
    rerender(
      <>
        <GlobalIconButtonTooltip />
        <button type="button" aria-label="收起详情" aria-expanded>
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent("收起详情"));
  });
});
