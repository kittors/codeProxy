import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Form, FormField } from "../Form";
import { TextInput } from "../Input";
import { Textarea } from "../Textarea";

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
    expect(input.className).toMatch(/border-rose/);
  });
});

describe("Form", () => {
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
