import {
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from "@code-proxy/domain";
import { rules, type Rule } from "@code-proxy/ui";

export {
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
};

export type PasswordMode = "auto" | "manual";

export type CreateUserForm = {
  username: string;
  displayName: string;
  passwordMode: PasswordMode;
  password: string;
  roleIds: string[];
};

export const emptyCreateUserForm = (): CreateUserForm => ({
  username: "",
  displayName: "",
  passwordMode: "auto",
  password: "",
  roleIds: [],
});

/*
 * 身份字段规则：判断沿用 @code-proxy/domain 里与 CliRelay 对齐的校验器，
 * 失败码与 `validation.*` 里的文案键同名（username_invalid_charset、password_too_short……），
 * 所以这里不需要再维护一张「失败码 → 文案」的映射表。空值交给 rules.required() 报「必填」。
 */
export const usernameRules: readonly Rule<string>[] = [
  rules.required(),
  rules.custom<string>((value) => {
    const result = validateUsername(value);
    return result.ok || result.code;
  }),
];

export const displayNameRules: readonly Rule<string>[] = [
  rules.required(),
  rules.custom<string>((value) => {
    const result = validateDisplayName(value);
    return result.ok || result.code;
  }),
];

export const passwordRules: readonly Rule<string>[] = [
  rules.required(),
  rules.custom<string>((value) => {
    const result = validatePassword(value);
    return result.ok || result.code;
  }),
];
