import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import i18n from "@code-proxy/i18n";
import { RestrictionMultiSelect } from "@features/api-key-restrictions";
import type { MultiSelectOption } from "@code-proxy/ui";

const OPTIONS: MultiSelectOption[] = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
];

function Harness({
  initialValue = [],
  onSelectionChange,
}: {
  initialValue?: string[];
  onSelectionChange?: (selected: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(initialValue);

  return (
    <RestrictionMultiSelect
      options={OPTIONS}
      value={value}
      onChange={(selected) => {
        setValue(selected);
        onSelectionChange?.(selected);
      }}
      placeholder="Select models..."
      unrestrictedLabel="All models"
      selectedCountLabel={(count) => `${count} models selected`}
      searchPlaceholder="Search models..."
      selectFilteredLabel="Select shown"
      clearRestrictionLabel="Allow all"
      noResultsLabel="No results"
    />
  );
}

describe("RestrictionMultiSelect", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("shows unrestricted state without an extra fake option", async () => {
    await i18n.changeLanguage("en");

    render(<Harness />);

    expect(screen.getByRole("button", { name: /all models/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /all models/i }));

    expect(screen.queryByText("Select All")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select shown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow all" })).toBeInTheDocument();
  });

  test("normalizes selecting every option back to unrestricted", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.click(screen.getByRole("button", { name: /all models/i }));
    await userEvent.click(screen.getByRole("button", { name: /codex/i }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["codex"]);

    await userEvent.click(screen.getByRole("button", { name: /claude/i }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("button", { name: /all models/i })).toBeInTheDocument();
  });

  test("can narrow by search and select only the visible results", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.click(screen.getByRole("button", { name: /all models/i }));
    await userEvent.type(screen.getByPlaceholderText("Search models..."), "clau");
    await userEvent.click(screen.getByRole("button", { name: "Select shown" }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(["claude"]);
    expect(screen.getByRole("button", { name: /1 models selected/i })).toBeInTheDocument();
  });
});
