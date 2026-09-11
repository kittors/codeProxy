import { describe, expect, test } from "vitest";
import { ApiClientError } from "@code-proxy/api-client";
import {
  passwordPolicyMessage,
  resolvePasswordApiError,
  validatePasswordField,
} from "../passwordPolicyErrors";

const messages: Record<string, string> = {
  "identity_admin.password_too_short": "密码至少需要 12 个字符。",
  "identity_admin.password_too_long": "密码不能超过 72 个字节。",
  "identity_admin.password_missing_upper": "密码须包含至少一个大写字母。",
  "identity_admin.password_missing_lower": "密码须包含至少一个小写字母。",
  "identity_admin.password_missing_special": "密码须包含至少一个特殊字符。",
  "identity_admin.password_requirement": "至少 12 个字符，且须包含大写字母、小写字母与特殊字符。",
};

const t = (key: string) => messages[key] ?? key;

function policyError(code: string) {
  return new ApiClientError({
    message: `validation failed: ${code}`,
    status: 400,
    payload: { error: { code, message: `validation failed: ${code}` } },
  });
}

describe("validatePasswordField", () => {
  test("names the rule that failed, not just the length", () => {
    // The tenant-creation form used to check only the length, which let all of
    // these through to the server and back as an English toast.
    expect(validatePasswordField("short", t)).toBe(messages["identity_admin.password_too_short"]);
    expect(validatePasswordField("alllowercase!", t)).toBe(
      messages["identity_admin.password_missing_upper"],
    );
    expect(validatePasswordField("ALLUPPERCASE!1", t)).toBe(
      messages["identity_admin.password_missing_lower"],
    );
    expect(validatePasswordField("NoSpecialChar1", t)).toBe(
      messages["identity_admin.password_missing_special"],
    );
  });

  test("measures the upper bound in bytes, matching bcrypt", () => {
    // 25 CJK characters is 75 UTF-8 bytes but only 25 code points, so a
    // character-count check would wave it past a limit the server enforces.
    expect(validatePasswordField(`Aa1!${"密".repeat(25)}`, t)).toBe(
      messages["identity_admin.password_too_long"],
    );
  });

  test("accepts a compliant password", () => {
    expect(validatePasswordField("Correct-Horse-1!", t)).toBe("");
  });
});

describe("resolvePasswordApiError", () => {
  test("translates a server-side password rejection", () => {
    // Client validation is a convenience, not the authority: an older panel
    // talking to a newer server still has to render the rejection in the
    // user's language rather than echoing the server's English sentence.
    expect(resolvePasswordApiError(policyError("password_missing_upper"), t)).toBe(
      messages["identity_admin.password_missing_upper"],
    );
  });

  test("returns null for failures that are not password rules", () => {
    expect(resolvePasswordApiError(policyError("version_conflict"), t)).toBeNull();
    expect(resolvePasswordApiError(new Error("network down"), t)).toBeNull();
  });
});

describe("passwordPolicyMessage", () => {
  test("falls back to the requirement sentence for an untranslated code", () => {
    const bare = (key: string) => key;
    expect(passwordPolicyMessage("password_missing_upper", bare)).toBe(
      "identity_admin.password_requirement",
    );
  });
});
