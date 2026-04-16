import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TextInput } from "@/modules/ui/Input";
import { SearchableCheckboxMultiSelect } from "@/modules/ui/SearchableCheckboxMultiSelect";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";

describe("shared control sizing", () => {
  test("uses default size across tabs and text inputs", () => {
    render(
      <>
        <Tabs value="one" onValueChange={vi.fn()}>
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
        </Tabs>
        <TextInput placeholder="Search" />
        <Select
          value=""
          onChange={vi.fn()}
          options={[{ value: "", label: "All status" }]}
          aria-label="Status"
        />
        <SearchableSelect
          value=""
          onChange={vi.fn()}
          options={[{ value: "", label: "All models" }]}
          aria-label="Model"
        />
        <SearchableCheckboxMultiSelect
          value={[]}
          onChange={vi.fn()}
          options={[{ value: "gpt", label: "GPT" }]}
          placeholder="All items"
          selectFilteredLabel="Select filtered"
          deselectFilteredLabel="Deselect filtered"
          selectedCountLabel={(count) => `${count} selected`}
          noResultsLabel="No results"
          aria-label="Multi model"
        />
      </>,
    );

    expect(screen.getByRole("tablist")).toHaveClass("h-9");
    expect(screen.getByRole("tab", { name: "One" })).toHaveClass("h-8");
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveClass(
      "h-9",
      "rounded-2xl",
      "border",
      "border-black/[0.04]",
      "bg-white",
      "text-[#71717A]",
      "shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)]",
      "hover:bg-[#FAFAFA]",
      "hover:text-[#18181B]",
      "focus-visible:ring-0",
      "focus-visible:ring-transparent",
      "dark:bg-[#27272A]",
      "dark:hover:bg-[#303036]",
      "dark:hover:text-white",
    );
    expect(screen.getByRole("textbox", { name: "Search" })).not.toHaveClass(
      "focus-visible:ring-2",
    );
    screen.getAllByRole("combobox").forEach((control) => {
      expect(control).toHaveClass(
        "h-9",
        "rounded-2xl",
        "border",
        "border-black/[0.04]",
        "bg-white",
        "text-[#71717A]",
        "shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)]",
        "hover:bg-[#FAFAFA]",
        "hover:text-[#18181B]",
        "focus-visible:ring-0",
        "focus-visible:ring-transparent",
        "dark:bg-[#27272A]",
        "dark:hover:bg-[#303036]",
        "dark:hover:text-white",
      );
      expect(control).not.toHaveClass("focus-visible:ring-2");
    });
  });

  test("exposes sm and lg sizes for shared controls", () => {
    render(
      <>
        <Tabs value="one" onValueChange={vi.fn()} size="sm">
          <TabsList>
            <TabsTrigger value="one">Small</TabsTrigger>
          </TabsList>
        </Tabs>
        <TextInput placeholder="Small input" size="sm" />
        <TextInput placeholder="Large input" size="lg" />
      </>,
    );

    expect(screen.getByRole("tablist")).toHaveClass("h-8");
    expect(screen.getByRole("tab", { name: "Small" })).toHaveClass("h-7");
    expect(screen.getByRole("textbox", { name: "Small input" })).toHaveClass("h-8");
    expect(screen.getByRole("textbox", { name: "Large input" })).toHaveClass("h-10");
  });

  test("uses shared select surface for searchable checkbox multi-select dropdown", async () => {
    const user = userEvent.setup();
    render(
      <SearchableCheckboxMultiSelect
        value={[]}
        onChange={vi.fn()}
        options={[{ value: "gpt", label: "GPT" }]}
        placeholder="All items"
        selectFilteredLabel="Select filtered"
        deselectFilteredLabel="Deselect filtered"
        selectedCountLabel={(count) => `${count} selected`}
        noResultsLabel="No results"
        aria-label="Multi model"
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Multi model" }));

    const dropdown = screen.getByRole("listbox", { name: "Multi model" }).parentElement;
    expect(dropdown).toHaveClass("rounded-2xl", "border-0", "bg-white");
    expect(screen.getByRole("textbox")).toHaveClass("h-6", "bg-transparent");
  });
});
