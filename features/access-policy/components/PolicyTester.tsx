import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical } from "lucide-react";
import { HUE_TILE, cn } from "@code-proxy/ui";
import { matchesAnyModelPattern } from "../model/modelMatch";
import type { ModelOption } from "./ModelPatternInput";
import { ModelTargetInput } from "./ModelTargetInput";

interface TesterRoute {
  from: readonly string[];
  to: string;
}

interface TesterRule {
  name: string;
  models: readonly string[];
  fallback: string;
}

/**
 * 试算：输入一个模型名，按与网关相同的规则说明它会被改写成什么、受哪些规则约束、用完后降级到哪里。
 * 规则一多，光看配置很难确定某个模型最终的去向，这里直接给出答案。
 */
export function PolicyTester({
  routes,
  rules,
  catalog,
}: {
  routes: readonly TesterRoute[];
  rules: readonly TesterRule[];
  catalog: readonly ModelOption[];
}) {
  const { t } = useTranslation();
  const resultId = useId();
  const [model, setModel] = useState("");
  const requested = model.trim();

  let lines: string[] = [];
  if (requested) {
    const routeIndex = routes.findIndex((route) => route.to.trim() && matchesAnyModelPattern(route.from, requested));
    const routed = routeIndex >= 0 ? routes[routeIndex].to.trim() : requested;
    const matched = rules.filter((rule) => rule.models.length > 0 && matchesAnyModelPattern(rule.models, routed));
    const ruleName = (rule: TesterRule) =>
      rule.name.trim() || t("access_policy.rule_untitled", { index: rules.indexOf(rule) + 1 });
    const fallbackRule = matched.find((rule) => rule.fallback.trim());
    lines = [
      routeIndex >= 0
        ? t("access_policy.tester_routed", { model: routed, index: routeIndex + 1 })
        : t("access_policy.tester_not_routed"),
      matched.length > 0
        ? t("access_policy.tester_rules", {
            rules: matched.map(ruleName).join(t("access_policy.list_separator")),
          })
        : t("access_policy.tester_no_rules"),
      ...(fallbackRule
        ? [
            t("access_policy.tester_fallback", {
              rule: ruleName(fallbackRule),
              model: fallbackRule.fallback.trim(),
            }),
          ]
        : []),
    ];
  }

  return (
    <div className="rounded-2xl bg-subtle p-3.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-2">
          <span
            aria-hidden="true"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-lg bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
              HUE_TILE.teal,
            )}
          >
            <FlaskConical size={13} />
          </span>
          {t("access_policy.tester_title")}
        </span>
        <div className="min-w-0 flex-1">
          <ModelTargetInput
            value={model}
            onChange={setModel}
            catalog={catalog}
            ariaLabel={t("access_policy.tester_input_label")}
            placeholder={t("access_policy.tester_placeholder")}
            describedBy={requested ? resultId : undefined}
          />
        </div>
      </div>
      {requested ? (
        <ul id={resultId} aria-live="polite" className="mt-2.5 space-y-1 pl-8 text-xs text-ink-2">
          {lines.map((line) => (
            <li key={line} className="list-disc">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
