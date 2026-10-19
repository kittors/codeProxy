import { QUOTA_METRICS, QUOTA_WINDOWS, type QuotaMatrix } from "@code-proxy/api-client";
import { formatQuotaAmount } from "./quotaFormat";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** 一个格子的短描述：「日 $10」「周 1,000 次」「月 5M Token」。 */
export const describeCell = (
  t: Translate,
  metric: (typeof QUOTA_METRICS)[number],
  window: (typeof QUOTA_WINDOWS)[number],
  value: number,
): string =>
  t(`access_policy.cell_short.${metric}`, {
    window: t(`access_policy.window_short.${window}`),
    value: formatQuotaAmount(metric, value, { compact: true }),
  });

/**
 * 一行文字概括一份策略：前几个限额 + 规则数 + 路由数。用在单选列表这类不能嵌套交互元素的地方。
 */
export const summarizePolicy = (
  t: Translate,
  policy: { limits: QuotaMatrix; rules?: readonly unknown[]; routes?: readonly unknown[] },
  maxCells = 3,
): string => {
  const cells = QUOTA_METRICS.flatMap((metric) =>
    QUOTA_WINDOWS.flatMap((window) =>
      policy.limits[metric][window] > 0 ? [describeCell(t, metric, window, policy.limits[metric][window])] : [],
    ),
  );
  const parts = cells.slice(0, maxCells);
  if (cells.length > maxCells) parts.push(t("access_policy.more_limits", { count: cells.length - maxCells }));
  if (parts.length === 0) parts.push(t("access_policy.unlimited"));
  const rules = policy.rules?.length ?? 0;
  const routes = policy.routes?.length ?? 0;
  if (rules > 0) parts.push(t("access_policy.rules_badge", { count: rules }));
  if (routes > 0) parts.push(t("access_policy.routes_badge", { count: routes }));
  return parts.join(" · ");
};
