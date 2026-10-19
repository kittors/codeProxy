import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Boxes, Route } from "lucide-react";
import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  type ModelRoute,
  type ModelRule,
  type QuotaUsageView,
} from "@code-proxy/api-client";
import { HUE_GLYPH, HUE_SOFT, HoverTooltip, cn } from "@code-proxy/ui";
import { ruleLabel } from "../model/resettableWindows";
import { formatQuotaAmount } from "../model/quotaFormat";

const CHIP = "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium";
const NEUTRAL = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

/** 规则里已经用满（≥100%）的格子数：列表上用琥珀色提醒「这个账号的某个模型已触顶」。 */
const exhaustedRules = (rules: readonly ModelRule[], usage?: QuotaUsageView): Set<string> => {
  const out = new Set<string>();
  if (!usage) return out;
  const usedById = new Map(usage.rules.map((item) => [item.id, item.used]));
  for (const rule of rules) {
    const used = usedById.get(rule.id);
    if (!used) continue;
    const hit = QUOTA_METRICS.some((metric) =>
      QUOTA_WINDOWS.some((window) => {
        const limit = rule.limits[metric][window];
        return limit > 0 && used[metric][window] >= limit;
      }),
    );
    if (hit) out.add(rule.id);
  }
  return out;
};

/**
 * 列表里的「模型策略」：规则数与路由数两枚胶囊，悬停看明细。规则触顶时胶囊变成琥珀色并带
 * 警告图标——总额度没用完、某个模型却已经被拦下，是最容易被忽略的情况。
 */
export function PolicyBadges({
  rules,
  routes = [],
  usage,
}: {
  rules: readonly ModelRule[];
  routes?: readonly ModelRoute[];
  usage?: QuotaUsageView;
}) {
  const { t } = useTranslation();
  if (rules.length === 0 && routes.length === 0) {
    return <span className="text-xs text-ink-4">{t("access_policy.no_model_policy")}</span>;
  }
  const exhausted = exhaustedRules(rules, usage);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {rules.length > 0 ? (
        <HoverTooltip
          content={
            <ul className="space-y-1 text-xs">
              {rules.map((rule) => {
                const cells = QUOTA_METRICS.flatMap((metric) =>
                  QUOTA_WINDOWS.flatMap((window) =>
                    rule.limits[metric][window] > 0
                      ? [
                          `${t(`access_policy.window_short.${window}`)} ${formatQuotaAmount(metric, rule.limits[metric][window], { compact: true })}${metric === "cost" ? "" : ` ${t(`access_policy.metric_short.${metric}`)}`}`,
                        ]
                      : [],
                  ),
                );
                return (
                  <li key={rule.id || ruleLabel(rule)}>
                    <span className="font-semibold">{ruleLabel(rule)}</span>
                    {exhausted.has(rule.id) ? ` · ${t("access_policy.rule_exhausted")}` : ""}
                    <br />
                    <span className="opacity-80">{cells.join(" · ")}</span>
                    {rule["fallback-model"] ? (
                      <span className="opacity-80">
                        {" "}
                        · {t("access_policy.fallback_to", { model: rule["fallback-model"] })}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          }
        >
          <button
            type="button"
            className={cn(
              CHIP,
              exhausted.size > 0
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : cn(NEUTRAL, HUE_SOFT.indigo),
            )}
          >
            {exhausted.size > 0 ? (
              <AlertTriangle size={12} aria-hidden="true" />
            ) : (
              <Boxes size={12} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.indigo)} />
            )}
            {t("access_policy.rules_badge", { count: rules.length })}
            {exhausted.size > 0 ? (
              <span className="sr-only">{t("access_policy.rules_exhausted_sr", { count: exhausted.size })}</span>
            ) : null}
          </button>
        </HoverTooltip>
      ) : null}
      {routes.length > 0 ? (
        <HoverTooltip
          content={
            <ul className="space-y-0.5 text-xs">
              {routes.map((route) => (
                <li key={route.id || `${route.from.join(",")}->${route.to}`} className="flex items-center gap-1">
                  <span className="font-mono">{route.from.join(", ")}</span>
                  <ArrowRight size={11} aria-hidden="true" />
                  <span className="font-mono">{route.to}</span>
                </li>
              ))}
            </ul>
          }
        >
          <button type="button" className={cn(CHIP, NEUTRAL, HUE_SOFT.teal)}>
            <Route size={12} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.teal)} />
            {t("access_policy.routes_badge", { count: routes.length })}
          </button>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
