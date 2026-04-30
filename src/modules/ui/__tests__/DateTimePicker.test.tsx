import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DateTimePicker } from "@/modules/ui/DateTimePicker";

const labels = {
  picker: "Date picker",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  open: "Open date picker",
  today: "Today",
  clear: "Clear",
  hour: "Hour",
  minute: "Minute",
};

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
};

const mockAnchorRect = (rect: Partial<DOMRect>) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 120,
    height: 40,
    left: 100,
    right: 340,
    top: 80,
    width: 240,
    x: 100,
    y: 80,
    toJSON: () => undefined,
    ...rect,
  } as DOMRect);
};

describe("DateTimePicker", () => {
  beforeEach(() => {
    setViewport(900, 700);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("opens from the input and keeps manual typing available", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function ControlledDateTimePicker() {
      const [value, setValue] = useState("2027-01-02T03:04");

      return (
        <DateTimePicker
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          aria-label="Subscription start date"
          labels={labels}
        />
      );
    }

    render(<ControlledDateTimePicker />);

    const input = screen.getByLabelText("Subscription start date");
    expect(input).toHaveValue("2027-01-02 03:04");

    await user.click(input);
    expect(screen.getByRole("dialog", { name: "Date picker" })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "2027-01-03 04:05");
    expect(onChange).toHaveBeenLastCalledWith("2027-01-03T04:05");
  });

  test("selects a date from the calendar and preserves the current time", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <DateTimePicker
        value="2027-01-02T03:04"
        onChange={onChange}
        aria-label="Subscription start date"
        labels={labels}
      />,
    );

    await user.click(screen.getByLabelText("Subscription start date"));
    await user.click(screen.getByRole("button", { name: "15" }));

    expect(onChange).toHaveBeenLastCalledWith("2027-01-15T03:04");
  });

  test("positions below when there is space and flips above without overflowing the viewport", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setViewport(320, 480);
    mockAnchorRect({ bottom: 462, left: 260, right: 316, top: 430, width: 56 });

    render(
      <DateTimePicker
        value="2027-01-02T03:04"
        onChange={onChange}
        aria-label="Subscription start date"
        labels={labels}
      />,
    );

    await user.click(screen.getByLabelText("Subscription start date"));

    const dialog = screen.getByRole("dialog", { name: "Date picker" });
    expect(dialog).toHaveAttribute("data-placement", "top");
    expect(dialog).toHaveStyle({ left: "12px", width: "296px" });
  });

  test("renders as a complete popover without an internal vertical scrollbar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    setViewport(900, 700);
    mockAnchorRect({ bottom: 80, top: 40 });

    render(
      <DateTimePicker
        value="2026-04-30T14:40"
        onChange={onChange}
        aria-label="Subscription start date"
        labels={labels}
      />,
    );

    await user.click(screen.getByLabelText("Subscription start date"));

    const dialog = screen.getByRole("dialog", { name: "Date picker" });
    expect(dialog).not.toHaveClass("overflow-y-auto");
    expect(dialog).not.toHaveStyle({ maxHeight: "360px" });
  });
});
