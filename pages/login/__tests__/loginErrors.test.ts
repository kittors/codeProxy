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
  "login.error_rate_limited_seconds": "请 {{seconds}} 秒后重试",
  "login.error_rate_limited_minutes": "请 {{minutes}} 分钟后重试",
  "identity_admin.password_missing_upper": "密码须包含至少一个大写字母。",
  "identity_admin.password_requirement": "至少 12 个字符。",
};

const t = ((key: string, options?: Record<string, unknown>) => {
  const template = messages[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ""));
}) as TFunction;

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

describe("cooldown duration", () => {
  // Reporting only "too many attempts" made a five-minute account cooldown
  // indistinguishable from a one-minute or a one-hour one, so users retried
  // straight onto the next rung of the lockout ladder instead of waiting.
  test("renders the remaining wait in seconds", () => {
    expect(
      resolveLoginErrorMessage({
        t,
        code: "login_cooldown",
        status: 429,
        details: { retry_after_seconds: 45 },
      }),
    ).toBe("请 45 秒后重试");
  });

  test("renders the remaining wait in minutes", () => {
    expect(
      resolveLoginErrorMessage({
        t,
        code: "login_cooldown",
        status: 429,
        details: { retry_after_seconds: 300 },
      }),
    ).toBe("请 5 分钟后重试");
  });

  test("falls back to the generic copy when the server sends no duration", () => {
    expect(resolveLoginErrorMessage({ t, code: "login_cooldown", status: 429 })).toBe("尝试过多");
  });
});

describe("password policy codes", () => {
  // The portal's change-password dialog shares this resolver, so a rule
  // rejection has to translate here too instead of falling through to the
  // generic 400 handling and surfacing as raw English.
  test("translates a password rule rejection", () => {
    expect(
      resolveLoginErrorMessage({ t, code: "password_missing_upper", status: 400 }),
    ).toBe("密码须包含至少一个大写字母。");
  });
});
