import { Check } from "lucide-react";
import { IDENTITY_PASSWORD_MIN_LENGTH, passwordRuleStatus } from "@code-proxy/domain";
import { passwordPolicyMessage, type PasswordPolicyTranslate } from "@features/password-policy";

/**
 * 新密码下方的实时清单：四段强度条 + 逐条规则。
 *
 * 规则来自领域层的 passwordRuleStatus，和提交时的 validatePassword 是同一份判断，
 * 清单打满的密码提交时一定能过。强度条在未满时只用墨色，全部满足才变成绿色——颜色
 * 只表达「可以提交了」这一个状态，不给半成品打分。
 */
export function PasswordChecklist({
  id,
  password,
  t,
}: {
  id: string;
  password: string;
  t: PasswordPolicyTranslate;
}) {
  const rules = passwordRuleStatus(password);
  const items = [
    {
      key: "length",
      met: rules.minLength,
      label: t("identity_admin.password_rule_min_length", { count: IDENTITY_PASSWORD_MIN_LENGTH }),
    },
    { key: "upper", met: rules.upper, label: t("identity_admin.password_rule_upper") },
    { key: "lower", met: rules.lower, label: t("identity_admin.password_rule_lower") },
    { key: "special", met: rules.special, label: t("identity_admin.password_rule_special") },
  ];
  const metCount = items.filter((item) => item.met).length;
  const complete = metCount === items.length && rules.maxBytes;

  return (
    <div id={id} className="space-y-2.5 pt-2.5" data-testid="password-checklist">
      <div className="flex gap-1" aria-hidden="true">
        {items.map((item, index) => (
          <span
            key={item.key}
            className={[
              "h-1 flex-1 rounded-full transition-colors duration-300 ease-soft",
              index < metCount ? (complete ? "bg-ok" : "bg-ink") : "bg-track",
            ].join(" ")}
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            data-met={item.met ? "true" : "false"}
            className={[
              "flex items-center gap-1.5 text-xs transition-colors duration-200",
              item.met ? "text-ink-2" : "text-ink-3",
            ].join(" ")}
          >
            <span
              // 未满足是一颗中性的实心小圆，满足后变绿打勾；不再画空心描边圈。
              className={[
                "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                item.met ? "bg-ok text-white" : "bg-track",
              ].join(" ")}
            >
              <Check
                size={10}
                strokeWidth={3}
                aria-hidden="true"
                className={[
                  "transition-[opacity,scale] duration-200 ease-spring",
                  item.met ? "scale-100 opacity-100" : "scale-50 opacity-0",
                ].join(" ")}
              />
            </span>
            {item.label}
          </li>
        ))}
      </ul>
      {rules.maxBytes ? null : (
        <p className="text-xs text-err">{passwordPolicyMessage("password_too_long", t)}</p>
      )}
    </div>
  );
}
