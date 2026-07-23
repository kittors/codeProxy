import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SearchableCheckboxMultiSelect } from "../SearchableCheckboxMultiSelect";

describe("SearchableCheckboxMultiSelect", () => {
  test("uses an explicit title for ReactNode option labels", () => {
    const title = "ryskt8qjfg@privaterelay.appleid.com";

    render(
      <SearchableCheckboxMultiSelect
        value={[]}
        onChange={() => undefined}
        options={[
          {
            value: "auth-index",
            label: <span>OAuth account</span>,
            searchText: title,
            title,
          },
        ]}
        placeholder="All channels"
        searchPlaceholder="Search channels"
        selectFilteredLabel="Select filtered"
        deselectFilteredLabel="Deselect filtered"
        selectedCountLabel={(count) => `${count} selected`}
        noResultsLabel="No results"
        aria-label="Channel filter"
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Channel filter" }));

    expect(screen.getByText("OAuth account").parentElement).toHaveAttribute("title", title);
  });
});
