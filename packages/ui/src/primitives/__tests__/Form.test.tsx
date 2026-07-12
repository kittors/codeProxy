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

  test("supports horizontal orientation with label left and control right", () => {
    const { container } = render(
      <FormField
        label="状态"
        description="租户状态"
        orientation="horizontal"
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
    expect(label).toHaveClass("w-12", "text-left");
    expect(content).not.toBeNull();
    expect(content).toContainElement(screen.getByRole("textbox"));
    expect(content).toContainElement(screen.getByText("租户状态"));
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
