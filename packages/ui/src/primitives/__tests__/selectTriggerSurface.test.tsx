import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { MultiSelect } from "../MultiSelect";
import { SearchableCheckboxMultiSelect } from "../SearchableCheckboxMultiSelect";
import { SearchableSelect } from "../SearchableSelect";
import { Select } from "../Select";

/**
 * 四个下拉触发器共用 controlSurfaceTrigger，展开态和禁用态都由 `data-state` 与原生
 * `disabled` 属性驱动，而不是条件拼接类名——旧写法靠 Tailwind 的输出顺序决定谁覆盖谁，
 * 禁用态的 `bg-white/70` 就是这样反过来盖住了静止态的填充，让控件在白面板上消失。
 *
 * 这里守住的是「属性挂对了」这一层；具体色值与合成后的可见度由
 * e2e/control-surface-states.spec.ts 在真实渲染里验证。
 */

const options = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
];

const renderTrigger = (name: string, disabled: boolean) => {
  switch (name) {
    case "Select":
      return render(
        <Select
          value="off"
          onChange={() => undefined}
          options={options}
          aria-label="Trigger"
          disabled={disabled}
        />,
      );
    case "SearchableSelect":
      return render(
        <SearchableSelect
          value="off"
          onChange={() => undefined}
          options={options}
          aria-label="Trigger"
          disabled={disabled}
        />,
      );
    case "SearchableCheckboxMultiSelect":
      return render(
        <SearchableCheckboxMultiSelect
          value={[]}
          onChange={() => undefined}
          options={options}
          placeholder="All"
          searchPlaceholder="Search"
          selectFilteredLabel="Select filtered"
          deselectFilteredLabel="Deselect filtered"
          selectedCountLabel={(count) => `${count} selected`}
          noResultsLabel="No results"
          aria-label="Trigger"
          disabled={disabled}
        />,
      );
    default:
      return render(
        <MultiSelect
          value={[]}
          onChange={() => undefined}
          options={options}
          aria-label="Trigger"
          disabled={disabled}
        />,
      );
  }
};

const TRIGGERS = ["Select", "SearchableSelect", "SearchableCheckboxMultiSelect"];

describe("下拉触发器表面", () => {
  test.each(TRIGGERS)("%s 静止时标记为 closed，且不带遗留的禁用类", (name) => {
    renderTrigger(name, false);

    const trigger = screen.getByRole("combobox", { name: "Trigger" });
    expect(trigger).toHaveAttribute("data-state", "closed");
    expect(trigger).not.toBeDisabled();
    // 旧实现遗留：白底 + 半透明，会让控件在白面板上整个消失。
    expect(trigger.className).not.toMatch(/\bbg-white\/70\b/);
    expect(trigger.className).not.toMatch(/\bopacity-(?:60|70)\b/);
  });

  test.each(TRIGGERS)("%s 禁用时靠 disabled 变体表达，而不是覆盖静止底色", (name) => {
    renderTrigger(name, true);

    const trigger = screen.getByRole("combobox", { name: "Trigger" });
    expect(trigger).toBeDisabled();
    // disabled: 变体的特异性高于裸类，覆盖关系不再取决于 Tailwind 的输出顺序。
    expect(trigger.className).toMatch(/\bdisabled:bg-slate-100\/80\b/);
    expect(trigger.className).toMatch(/\bdisabled:text-slate-400\b/);
  });

  test.each(TRIGGERS)("%s 展开后把 data-state 切到 open", async (name) => {
    const user = userEvent.setup();
    renderTrigger(name, false);

    const trigger = screen.getByRole("combobox", { name: "Trigger" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("data-state", "open");
  });

  test("MultiSelect 同样由属性驱动展开与禁用", async () => {
    const user = userEvent.setup();
    const { unmount } = renderTrigger("MultiSelect", false);

    // MultiSelect 的触发器没有 combobox role，按可访问名之外的唯一 button 定位。
    const trigger = screen.getAllByRole("button")[0];
    expect(trigger).toHaveAttribute("data-state", "closed");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("data-state", "open");
    unmount();

    renderTrigger("MultiSelect", true);
    const disabledTrigger = screen.getAllByRole("button")[0];
    expect(disabledTrigger).toBeDisabled();
    expect(disabledTrigger.className).toMatch(/\bdisabled:bg-slate-100\/80\b/);
  });
});
