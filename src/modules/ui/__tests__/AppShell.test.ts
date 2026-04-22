import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AppShell", () => {
  test("renders the sidebar toggle as a plain icon button without a surface", () => {
    const source = readModule("modules/ui/AppShell.tsx");
    const toggleButtonClass =
      source.match(/aria-label=\{sidebarLabel\}[\s\S]*?className="([^"]+)"/)?.[1] ?? "";

    expect(toggleButtonClass).toContain("bg-transparent");
    expect(toggleButtonClass).toContain("border-0");
    expect(toggleButtonClass).toContain("shadow-none");
    expect(toggleButtonClass).not.toContain("bg-white");
    expect(toggleButtonClass).not.toContain("border border");
    expect(toggleButtonClass).not.toContain("shadow-sm");
  });

  test("smoothly transitions shell theme surfaces without animating every property", () => {
    const source = readModule("modules/ui/AppShell.tsx");

    expect(source).toContain(
      "motion-safe:transition-[width,transform,background-color,border-color]",
    );
    expect(source).toContain("motion-safe:transition-colors");
    expect(source).toContain("transition-colors duration-200 ease-out");
  });

  test("keeps the current nav structure without the unfinished upgrade prompt", () => {
    const source = readModule("modules/ui/AppShell.tsx");

    expect(source).toContain("shell.sidebar_account_role");
    expect(source).toContain("NAV_ITEMS.map");
    expect(source).not.toContain("shell.upgrade_title");
    expect(source).not.toContain("shell.upgrade_description");
    expect(source).not.toContain("shell.upgrade_action");
    expect(source).not.toContain("nav_home_placeholder");
  });
});
