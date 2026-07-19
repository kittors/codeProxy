import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import { resolveLoginErrorMessage } from "../loginErrors";

const messages: Record<string, string> = {
  "login.error_invalid_credentials": "用户名或密码错误",
  "login.account_unavailable": "账号不可用",
  "login.tenant_expired": "租户已到期",
  "login.tenant_suspended": "租户已暂停",
  "login.error_rate_limited": "尝试过多",
  "login.error_server": "服务器错误",
  "login.error_required": "请填写完整信息",
  "login.error_timeout": "连接超时",
  "login.error_not_found": "地址无效",
  "login.error_network": "网络失败",
  "login.error_invalid": "登录失败",
};

const t = ((key: string) => messages[key] ?? key) as TFunction;

describe("resolveLoginErrorMessage", () => {
  test("maps invalid_credentials code", () => {
    expect(
      resolveLoginErrorMessage({ t, code: "invalid_credentials", status: 401 }),
    ).toBe("用户名或密码错误");
  });

  test("maps account disabled/locked codes", () => {
    expect(resolveLoginErrorMessage({ t, code: "account_disabled" })).toBe("账号不可用");
    expect(resolveLoginErrorMessage({ t, code: "account_locked" })).toBe("账号不可用");
  });

  test("maps tenant lifecycle codes", () => {
    expect(resolveLoginErrorMessage({ t, code: "tenant_expired" })).toBe("租户已到期");
    expect(resolveLoginErrorMessage({ t, code: "tenant_suspended" })).toBe("租户已暂停");
  });

  test("maps rate limit by code or status", () => {
    expect(resolveLoginErrorMessage({ t, code: "login_rate_limited", status: 429 })).toBe(
      "尝试过多",
    );
    expect(resolveLoginErrorMessage({ t, code: "login_cooldown", status: 429 })).toBe("尝试过多");
    expect(resolveLoginErrorMessage({ t, status: 429 })).toBe("尝试过多");
  });

  test("maps portal internal_error code", () => {
    expect(resolveLoginErrorMessage({ t, code: "internal_error", status: 500 })).toBe("服务器错误");
  });

  test("falls back to status-based messages", () => {
    expect(resolveLoginErrorMessage({ t, status: 401 })).toBe("用户名或密码错误");
    expect(resolveLoginErrorMessage({ t, status: 404 })).toBe("地址无效");
    expect(resolveLoginErrorMessage({ t, status: 500 })).toBe("服务器错误");
    expect(resolveLoginErrorMessage({ t, status: 0 })).toBe("网络失败");
  });

  test("uses timeout flag before generic fallback", () => {
    expect(resolveLoginErrorMessage({ t, isTimeout: true, status: 0 })).toBe("连接超时");
  });

  test("uses raw fallback message only when no code/status mapping applies", () => {
    expect(
      resolveLoginErrorMessage({
        t,
        status: 418,
        fallbackMessage: "I'm a teapot",
      }),
    ).toBe("I'm a teapot");
  });

  test("defaults to generic login failure", () => {
    expect(resolveLoginErrorMessage({ t, status: 418 })).toBe("登录失败");
  });
});
