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
const SINGLE_OPTION: MultiSelectOption[] = [{ value: "minimax-m3", label: "minimax-m3" }];

function Harness({
  options = OPTIONS,
  initialValue = [],
  onSelectionChange,
}: {
  options?: MultiSelectOption[];
  initialValue?: string[];
  onSelectionChange?: (selected: string[]) => void;
}) {
  const [value, setValue] = useState<string[]>(initialValue);

  return (
    <>
      <label htmlFor="restriction-models">Models</label>
      <RestrictionMultiSelect
        id="restriction-models"
        options={options}
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
    </>
  );
}

// 触发器是 combobox：名称来自字段标签，当前选择是它显示的内容。
const trigger = () => screen.getByRole("combobox", { name: "Models" });

describe("RestrictionMultiSelect", () => {
  afterEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  test("shows unrestricted state without an extra fake option", async () => {
    await i18n.changeLanguage("en");

    render(<Harness />);

    expect(trigger()).toHaveTextContent(/all models/i);
    await userEvent.click(trigger());

    expect(screen.queryByText("Select All")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select shown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow all" })).toBeInTheDocument();
  });

  test("normalizes selecting every option back to unrestricted", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: /codex/i }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["codex"]);

    await userEvent.click(screen.getByRole("button", { name: /claude/i }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(trigger()).toHaveTextContent(/all models/i);
  });

  test("can narrow by search and select only the visible results", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    await userEvent.type(screen.getByPlaceholderText("Search models..."), "clau");
    await userEvent.click(screen.getByRole("button", { name: "Select shown" }));

    expect(onSelectionChange).toHaveBeenLastCalledWith(["claude"]);
    expect(trigger()).toHaveTextContent(/1 models selected/i);
  });

  test("can select and deselect the only available option", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness options={SINGLE_OPTION} onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    const option = screen.getByRole("button", { name: "minimax-m3" });
    expect(option.querySelector("svg")).not.toBeInTheDocument();

    await userEvent.click(option);
    expect(onSelectionChange).toHaveBeenLastCalledWith(["minimax-m3"]);
    expect(trigger()).toHaveTextContent(/1 models selected/i);
    expect(option.querySelector("svg")).toBeInTheDocument();

    await userEvent.click(option);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(trigger()).toHaveTextContent(/all models/i);
    expect(option.querySelector("svg")).not.toBeInTheDocument();
  });

  test("can select the only filtered result and clear the restriction", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness options={SINGLE_OPTION} onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    await userEvent.type(screen.getByPlaceholderText("Search models..."), "mini");
    await userEvent.click(screen.getByRole("button", { name: "Select shown" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(["minimax-m3"]);

    await userEvent.click(screen.getByRole("button", { name: "Allow all" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(trigger()).toHaveTextContent(/all models/i);
  });

  test("keeps full multi-option filtered selection unrestricted", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    await userEvent.type(screen.getByPlaceholderText("Search models..."), "c");
    await userEvent.click(screen.getByRole("button", { name: "Select shown" }));

    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByRole("button", { name: "Codex" }).querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "Claude" }).querySelector("svg")).toBeNull();
  });

  test("drops stale values and deduplicates the current selection", async () => {
    await i18n.changeLanguage("en");

    render(<Harness initialValue={["stale", "codex", "codex"]} />);

    expect(trigger()).toHaveTextContent(/1 models selected/i);
    await userEvent.click(trigger());
    expect(screen.getByRole("button", { name: "Codex" }).querySelector("svg")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claude" }).querySelector("svg")).toBeNull();
  });

  test("treats stale selections as unrestricted when there are no options", async () => {
    await i18n.changeLanguage("en");
    const onSelectionChange = vi.fn();

    render(<Harness options={[]} initialValue={["stale"]} onSelectionChange={onSelectionChange} />);

    await userEvent.click(trigger());
    expect(screen.getByText("All models")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select shown" })).toBeDisabled();
    expect(screen.getByText("No results")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Allow all" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });
});
