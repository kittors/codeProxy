import { describe, expect, test } from "vitest";
import type { MenuIdentity } from "@code-proxy/api-client";
import { LEGACY_SERVICE_MENUS } from "@app/providers/legacyServiceMenus";
import { buildSidebarFromMenus, getPageTitleKey, withAppearanceMenu } from "../navModel";

const menu = (partial: Partial<MenuIdentity> & Pick<MenuIdentity, "code">): MenuIdentity => ({
  parent_code: "",
  type: "menu",
  path: "",
  component: "",
  link_url: "",
  label_key: partial.code,
  title: "",
  icon: "",
  permission_code: "",
  sort_order: 0,
  visible: true,
  enabled: true,
  badge_type: "",
  badge_content: "",
  hide_menu: false,
  system_protected: true,
  version: 1,
  ...partial,
});

const dashboard = menu({ code: "dashboard", path: "/dashboard", component: "dashboard", sort_order: 10 });
const systemGroup = menu({ code: "group.system", type: "directory", path: "/system", component: "Layout", sort_order: 60 });
const config = menu({
  code: "system.config",
  parent_code: "group.system",
  path: "/system/config",
  component: "config",
  sort_order: 10,
});

const appearanceItems = (menus: MenuIdentity[]) =>
  buildSidebarFromMenus(menus)
    .groups.flatMap((group) => group.items)
    .filter((item) => item.to === "/system/appearance");

describe("appearance menu backfill", () => {
  test("a backend that predates the appearance menu still gets the entry under 系统设置", () => {
    const groups = buildSidebarFromMenus(withAppearanceMenu([dashboard, systemGroup, config])).groups;
    const system = groups.find((group) => group.id === "group.system");
    expect(system?.items.map((item) => item.to)).toEqual(["/system/config", "/system/appearance"]);
  });

  test("users without any system menu get the 系统设置 group created around it", () => {
    const menus = withAppearanceMenu([dashboard]);
    expect(menus.map((item) => item.code)).toEqual(["dashboard", "group.system", "system.appearance"]);
    expect(appearanceItems(menus)).toHaveLength(1);
  });

  test("the backend's own entry wins, even when menu management hid it", () => {
    const hidden = menu({
      code: "system.appearance",
      parent_code: "group.system",
      path: "/system/appearance",
      component: "appearance",
      hide_menu: true,
    });
    const menus = withAppearanceMenu([dashboard, systemGroup, hidden]);
    expect(menus.filter((item) => item.code === "system.appearance")).toEqual([hidden]);
    expect(appearanceItems(menus)).toHaveLength(0);
  });

  test("the management-key menu mirror carries the same entry as CliRelay's catalog", () => {
    const entry = LEGACY_SERVICE_MENUS.find((item) => item.code === "system.appearance");
    expect(entry).toMatchObject({
      parent_code: "group.system",
      path: "/system/appearance",
      component: "appearance",
      label_key: "shell.nav_appearance",
      icon: "palette",
      permission_code: "",
    });
    expect(getPageTitleKey("/system/appearance")).toBe("shell.nav_appearance");
  });
});
