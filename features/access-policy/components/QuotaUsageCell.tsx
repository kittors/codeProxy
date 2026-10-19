import { useTranslation } from "react-i18next";
import { Infinity as InfinityIcon } from "lucide-react";
import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  type QuotaMatrix,
  type QuotaMetric,
  type QuotaWindow,
} from "@code-proxy/api-client";
import { HoverTooltip, cn } from "@code-proxy/ui";
import {
  USAGE_BAR_FILL,
  USAGE_BAR_TRACK,
  USAGE_TEXT,
  formatQuotaAmount,
  usageRatio,
  usageTone,
} from "../model/quotaFormat";
import { MetricGlyph } from "./metricMeta";

interface CellUsage {
  metric: QuotaMetric;
  window: QuotaWindow;
  limit: number;
  used?: number;
  ratio: number;
}

const collectCells = (limits: QuotaMatrix, usage?: QuotaMatrix): CellUsage[] =>
  QUOTA_METRICS.flatMap((metric) =>
    QUOTA_WINDOWS.flatMap((window): CellUsage[] => {
      const limit = limits[metric][window];
      if (limit <= 0) return [];
      const used = usage?.[metric][window];
      return [{ metric, window, limit, used, ratio: usageRatio(used, limit) }];
    }),
  );

/** 「不限制」：简约风格是中性胶囊，多彩风格叠回绿色。 */
export function UnlimitedChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-1 text-xs font-medium text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-300">
      <InfinityIcon size={13} aria-hidden="true" className="text-ink-3 colorful:text-current" />
      {label}
    </span>
  );
}

function CellLine({ cell, withBar }: { cell: CellUsage; withBar: boolean }) {
  const { t } = useTranslation();
  const tone = usageTone(cell.ratio);
  const hasUsage = typeof cell.used === "number";
  const label = `${t(`access_policy.window_short.${cell.window}`)}`;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1 text-xs">
        <MetricGlyph metric={cell.metric} size={12} />
        <span className="shrink-0 font-semibold text-ink-2">{label}</span>
        <span className={cn("min-w-0 truncate tabular-nums", hasUsage ? USAGE_TEXT[tone] : "text-ink-2")}>
          {hasUsage
            ? `${formatQuotaAmount(cell.metric, cell.used, { compact: true })} / ${formatQuotaAmount(cell.metric, cell.limit, { compact: true })}`
            : formatQuotaAmount(cell.metric, cell.limit, { compact: true })}
        </span>
      </div>
      {withBar && hasUsage ? (
        <div className={cn("mt-1 h-1 overflow-hidden rounded-full", USAGE_BAR_TRACK[tone])}>
          <div
            className={cn("h-full rounded-full", USAGE_BAR_FILL[tone])}
            style={{ width: `${Math.min(100, Math.max(cell.ratio > 0 ? 4 : 0, cell.ratio * 100))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * 列表里的额度格：只列出配置了的格子，按用量占比从高到低排——最该关注的在最前面。
 * 两列网格，最多四格（两行，和账号名两行等高）；放不下的收进最后一格的「+N」，悬停看全部。
 * 没有任何限额时显示「不限制」。不传 usage 时只显示上限（模板列表）。
 */
export function QuotaUsageCell({
  limits,
  usage,
  max = 4,
  className,
}: {
  limits: QuotaMatrix;
  usage?: QuotaMatrix;
  max?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const cells = collectCells(limits, usage);
  if (cells.length === 0) return <UnlimitedChip label={t("access_policy.unlimited")} />;
  const ordered = usage ? [...cells].sort((a, b) => b.ratio - a.ratio) : cells;
  // 超出时最后一格让给「+N」，总格数仍是 max。
  const visible = ordered.length > max ? ordered.slice(0, max - 1) : ordered;
  const hidden = ordered.length - visible.length;
  const withBar = Boolean(usage);
  const describe = (cell: CellUsage) =>
    typeof cell.used === "number"
      ? t("access_policy.cell_usage_detail", {
          metric: t(`access_policy.metric.${cell.metric}`),
          window: t(`access_policy.window.${cell.window}`),
          used: formatQuotaAmount(cell.metric, cell.used),
          limit: formatQuotaAmount(cell.metric, cell.limit),
        })
      : `${t(`access_policy.metric.${cell.metric}`)} · ${t(`access_policy.window.${cell.window}`)}: ${formatQuotaAmount(cell.metric, cell.limit)}`;
  return (
    <div className={cn("grid min-w-0 grid-cols-2 items-center gap-x-4 gap-y-1.5", className)}>
      {visible.map((cell) => (
        <div key={`${cell.metric}.${cell.window}`} className="min-w-0" title={describe(cell)}>
          <CellLine cell={cell} withBar={withBar} />
        </div>
      ))}
      {hidden > 0 ? (
        <HoverTooltip
          className="!flex"
          content={
            <ul className="space-y-0.5 text-xs">
              {ordered.map((cell) => (
                <li key={`${cell.metric}.${cell.window}`}>{describe(cell)}</li>
              ))}
            </ul>
          }
        >
          <button
            type="button"
            aria-label={t("access_policy.more_cells", { count: hidden })}
            className="inline-flex h-6 items-center rounded-full bg-ink/[0.05] px-2 text-xs font-medium tabular-nums text-ink-2 hover:bg-ink/[0.08] dark:bg-white/[0.07] dark:hover:bg-white/[0.1]"
          >
            +{hidden}
          </button>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
