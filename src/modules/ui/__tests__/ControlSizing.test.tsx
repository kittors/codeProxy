import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TextInput } from "@/modules/ui/Input";
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
      </>,
    );

    expect(screen.getByRole("tablist")).toHaveClass("h-9");
    expect(screen.getByRole("tab", { name: "One" })).toHaveClass("h-8");
    expect(screen.getByRole("textbox", { name: "Search" })).toHaveClass(
      "h-9",
      "rounded-2xl",
      "border-0",
      "bg-white",
    );
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
});
