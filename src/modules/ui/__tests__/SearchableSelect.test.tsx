import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";

describe("SearchableSelect", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("positions the dropdown above the trigger when the viewport has no room below", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 600,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") === "combobox") {
        return {
          x: 120,
          y: 550,
          top: 550,
          bottom: 590,
          left: 120,
          right: 340,
          width: 220,
          height: 40,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    });

    render(
      <SearchableSelect
        value=""
        onChange={vi.fn()}
        aria-label="Select model"
        placeholder="Select model"
        searchPlaceholder="Search models"
        options={Array.from({ length: 12 }, (_, index) => ({
          value: `model-${index}`,
          label: `model-${index}`,
        }))}
      />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Select model" });
    expect(Number.parseFloat(listbox.style.top)).toBeLessThan(550);
    expect(Number.parseFloat(listbox.style.top)).toBeGreaterThanOrEqual(0);
  });
});
