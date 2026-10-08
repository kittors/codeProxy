import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Form, FormField } from "../Form";
import { TextInput } from "../Input";
import { Textarea } from "../Textarea";
import { ToggleSwitch } from "../ToggleSwitch";
import { DateTimePicker } from "../DateTimePicker";
import { MultiSelect } from "../MultiSelect";
import { SearchableCheckboxMultiSelect } from "../SearchableCheckboxMultiSelect";
import { SearchableSelect } from "../SearchableSelect";

const pickerLabels = {
  picker: "Pick",
  open: "Open calendar",
  previousMonth: "Previous",
  nextMonth: "Next",
  today: "Today",
  clear: "Clear",
  hour: "Hour",
  minute: "Minute",
};

describe("FormField", () => {
  test("wires label, description, and control id for accessibility", () => {
    render(
      <FormField label="名称" description="租户显示名称" htmlFor="tenant-name">
        <TextInput />
      </FormField>,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("id", "tenant-name");
    expect(screen.getByText("名称")).toHaveAttribute("for", "tenant-name");
    expect(input).toHaveAttribute("aria-describedby", "tenant-name-description");
    expect(screen.getByText("租户显示名称")).toHaveAttribute("id", "tenant-name-description");
  });

  test("marks the control invalid and exposes the error message", () => {
    render(
      <FormField label="名称" error="名称不能为空" htmlFor="tenant-name-error">
        <TextInput />
      </FormField>,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "tenant-name-error-error");
    expect(screen.getByRole("alert")).toHaveTextContent("名称不能为空");
  });

  test("keeps description when error is present", () => {
    render(
      <FormField
        label="密码"
        description="至少 12 位"
        error="缺少大写"
        htmlFor="pwd-both"
      >
        <TextInput type="password" />
      </FormField>,
    );
    expect(screen.getByText("至少 12 位")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("缺少大写");
  });

  test("shows character count in meta", () => {
    render(
      <FormField label="名称" maxLength={128} valueLength={3} htmlFor="name-count">
        <TextInput />
      </FormField>,
    );
    expect(screen.getByText("3 / 128")).toBeInTheDocument();
  });

  test("supports horizontal orientation with configurable label width", () => {
    const { container } = render(
      <FormField
        label="状态"
        description="租户状态"
        orientation="horizontal"
        labelWidth="w-32"
        htmlFor="tenant-status"
      >
        <TextInput />
      </FormField>,
    );

    const field = container.querySelector("[data-slot='form-field']");
    const label = screen.getByText("状态");
    const content = container.querySelector("[data-slot='form-field-content']");
    expect(field).toHaveAttribute("data-orientation", "horizontal");
    expect(field).toHaveClass("items-start");
    expect(label).toHaveClass("w-32", "text-left");
    expect(content).not.toBeNull();
    expect(content).toContainElement(screen.getByRole("textbox"));
    expect(content).toContainElement(screen.getByText("租户状态"));
  });

  test("TextInput applies invalid styles via aria-invalid", () => {
    render(
      <FormField label="名称" error="err" htmlFor="inv">
        <TextInput />
      </FormField>,
    );
    const input = screen.getByRole("textbox");
    // 红色阴影描边由 aria-invalid 属性驱动（controlSurface 里的 aria-[invalid=true] 变体），
    // 这里同时守住「属性挂上了」和「样式规则在」两层。控件不用 border，描边是阴影。
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.className).toMatch(/aria-\[invalid=true\]:shadow-\[0_0_0_1px_rgb\(229_72_77/);
    expect(input.className).not.toMatch(/(^|\s)border(\s|$)/);
  });

  test("wires FormField label and description to ToggleSwitch", () => {
    render(
      <FormField label="清除 API Key" description="保存后立即生效" htmlFor="clear-key">
        <ToggleSwitch checked={false} onCheckedChange={() => undefined} />
      </FormField>,
    );

    const toggle = screen.getByRole("switch", { name: "清除 API Key" });
    expect(toggle).toHaveAttribute("id", "clear-key");
    expect(toggle).toHaveAttribute("aria-describedby", "clear-key-description");
  });
});

describe("FormField with composite controls", () => {
  // 下拉、多选、日期选择器以前吞掉 FormField 注入的 id / aria-invalid：点标签聚焦不过去，
  // 出错时没有红框、读屏读不到错误，提交校验也没法把焦点送到它们身上。
  const cases = [
    {
      name: "SearchableSelect",
      control: <SearchableSelect value="" onChange={() => undefined} options={[{ value: "a", label: "A" }]} />,
      role: "combobox",
    },
    {
      name: "SearchableCheckboxMultiSelect",
      control: (
        <SearchableCheckboxMultiSelect
          value={[]}
          onChange={() => undefined}
          options={[{ value: "a", label: "A" }]}
          selectFilteredLabel="Select"
          deselectFilteredLabel="Deselect"
          selectedCountLabel={(count) => `${count}`}
          noResultsLabel="None"
        />
      ),
      role: "combobox",
    },
    {
      name: "MultiSelect",
      control: <MultiSelect value={[]} onChange={() => undefined} options={[{ value: "a", label: "A" }]} />,
      role: "combobox",
    },
    {
      name: "DateTimePicker",
      control: (
        <DateTimePicker value="" onChange={() => undefined} aria-label="到期时间" labels={pickerLabels} />
      ),
      role: "textbox",
    },
  ] as const;

  for (const item of cases) {
    test(`${item.name} takes the label, error state and error description`, () => {
      render(
        <FormField label="到期时间" error="必填" htmlFor={`field-${item.name}`}>
          {item.control}
        </FormField>,
      );
      const control = document.getElementById(`field-${item.name}`);
      expect(control).not.toBeNull();
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAttribute("aria-describedby", `field-${item.name}-error`);
      expect(screen.getByRole(item.role, { name: "到期时间" })).toBe(control);
    });
  }
});

describe("Form", () => {
  test("hands its form element to a ref, for focusing the first invalid field", () => {
    const ref = createRef<HTMLFormElement>();
    render(<Form ref={ref} aria-label="Profile" />);
    expect(ref.current).toBe(screen.getByRole("form", { name: "Profile" }));
  });

  test("renders a form shell with default field spacing", () => {
    const { container } = render(
      <Form id="edit-tenant-form" aria-label="edit-tenant">
        <FormField label="描述">
          <Textarea defaultValue="demo" />
        </FormField>
      </Form>,
    );

    const form = container.querySelector("form");
    expect(form).toHaveAttribute("id", "edit-tenant-form");
    expect(form).toHaveClass("space-y-4");
    expect(screen.getByRole("textbox")).toHaveValue("demo");
  });
});
