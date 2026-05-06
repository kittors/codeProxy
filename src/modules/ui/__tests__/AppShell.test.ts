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

  test("uses basename-relative management navigation targets", () => {
    const source = readModule("modules/ui/AppShell.tsx");
    const navBlock = source.match(/const NAV_ITEMS = \[[\s\S]*?\] as const;/)?.[0] ?? "";

    expect(navBlock).toContain('to: "/ccswitch-import-settings"');
    expect(navBlock).toContain('i18nKey: "shell.nav_ccswitch_import_settings"');
    expect(navBlock).toContain('to: "/identity-fingerprint"');
    expect(navBlock).toContain('to: "/models"');
    expect(navBlock).toContain('to: "/proxies"');
    expect(navBlock).toContain('to: "/api-key-permissions"');
    expect(navBlock).toContain('i18nKey: "shell.nav_api_key_permissions"');
    expect(navBlock).not.toContain('to: "/manage/identity-fingerprint"');
    expect(navBlock).not.toContain('to: "/manage/models"');
  });

  test("resolves the API key permissions page title from its dedicated route", () => {
    const source = readModule("modules/ui/AppShell.tsx");

    expect(source).toContain('pathname.startsWith("/api-key-permissions")');
    expect(source).toContain('"shell.page_api_key_permissions"');
  });

  test("uses an icon-based account section without bordered card chrome", () => {
    const source = readModule("modules/ui/AppShell.tsx");
    const accountBlock =
      source.match(
        /<div className="space-y-3 px-3 pb-4">[\s\S]*?<\/div>\s*<\/div>\s*<\/aside>/,
      )?.[0] ?? "";

    expect(source).toContain("accountLogoutLabel");
    expect(source).toContain("<LogOut size={15} />");
    expect(source).toContain("aria-label={accountLogoutLabel}");
    expect(accountBlock).not.toContain(">A<");
    expect(accountBlock).not.toContain("border border-slate");
    expect(accountBlock).not.toContain("bg-white p-3");
    expect(accountBlock).not.toContain("shadow-[0_8px_20px");
  });

  test("keeps the logout icon button plain without background or motion bounce", () => {
    const source = readModule("modules/ui/AppShell.tsx");
    const logoutButtonClass =
      source.match(/aria-label=\{accountLogoutLabel\}[\s\S]*?className="([^"]+)"/)?.[1] ?? "";

    expect(logoutButtonClass).toContain("bg-transparent");
    expect(logoutButtonClass).not.toContain("bg-slate-100");
    expect(logoutButtonClass).not.toContain("dark:bg-neutral-800");
    expect(logoutButtonClass).not.toContain("hover:-translate-y-0.5");
    expect(logoutButtonClass).not.toContain("active:scale-95");
  });
});
