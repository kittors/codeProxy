import {
  validateDisplayName,
  validatePassword,
  validateUsername,
  type IdentityValidationResult,
} from "@code-proxy/domain";
import { rules, type Rule } from "@code-proxy/ui";

/*
 * 身份字段的表单规则：判断全部来自 @code-proxy/domain 里与 CliRelay 对齐的校验器，失败码与
 * `validation.*` 文案键同名（username_invalid_charset、password_too_short……），所以不需要
 * 「失败码 → 文案」的映射表。空值交给 rules.required() 报「必填」。
 *
 * 用户、租户首个管理员、门户账号、门户改密共用这一份：以前每个页面各包一遍，密码策略一改要改四处，
 * 漏掉一处就会出现「这里放行、那里拒绝」。
 */
const fromDomain =
  (validate: (value: string) => IdentityValidationResult): Rule<string> =>
  (value) => {
    if (!value) return null;
    const result = validate(value);
    return result.ok ? null : { key: result.code };
  };

export const usernameRules: readonly Rule<string>[] = [
  rules.required(),
  fromDomain(validateUsername),
];

export const displayNameRules: readonly Rule<string>[] = [
  rules.required(),
  fromDomain(validateDisplayName),
];

export const passwordRules: readonly Rule<string>[] = [
  rules.required(),
  fromDomain(validatePassword),
];

/** 密码留空 = 由服务端生成（创建）/ 不修改（编辑）；填了就必须满足同一套密码策略。 */
export const optionalPasswordRules: readonly Rule<string>[] = [fromDomain(validatePassword)];
