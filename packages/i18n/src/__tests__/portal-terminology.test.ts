import { describe, expect, test } from "vitest";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

describe("portal terminology", () => {
  test("uses the exact English monitor, menu, page, and portal chart labels", () => {
    expect(en.monitor.apikey_distribution).toBe("Portal User Usage Share");
    expect(en.shell.nav_end_users).toBe("Portal Accounts");
    expect(en.shell.nav_api_key_permissions).toBe("Portal Account Permissions");
    expect(en.shell.page_api_key_permissions).toBe("Portal Account Permissions");
    expect(en.end_users.title).toBe("Portal Accounts");
    expect(en.api_key_permissions_page.title).toBe("Portal Account Permissions");
    expect(en.apikey_lookup.api_key_distribution).toBe("API Key Usage Share");
    expect(en.apikey_lookup.api_key_distribution_desc).toBe(
      "Last {{days}} days · by {{metric}} · Top10",
    );
  });

  test("uses the exact Simplified Chinese monitor, menu, page, and portal chart labels", () => {
    expect(zhCN.monitor.apikey_distribution).toBe("门户用户使用占比");
    expect(zhCN.shell.nav_end_users).toBe("门户账号");
    expect(zhCN.shell.nav_api_key_permissions).toBe("门户账号权限");
    expect(zhCN.shell.page_api_key_permissions).toBe("门户账号权限");
    expect(zhCN.end_users.title).toBe("门户账号");
    expect(zhCN.api_key_permissions_page.title).toBe("门户账号权限");
    expect(zhCN.apikey_lookup.api_key_distribution).toBe("API Key 使用占比");
    expect(zhCN.apikey_lookup.api_key_distribution_desc).toBe(
      "最近 {{days}} 天 · 按{{metric}} · Top10",
    );
  });
});
