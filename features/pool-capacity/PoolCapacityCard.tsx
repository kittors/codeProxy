import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Gauge, RefreshCw } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import { Button, Skeleton, surface } from "@code-proxy/ui";
import {
  KNOWN_WINDOW_KEYS,
  buildPoolRows,
  formatClockTime,
  formatRelativeTime,
  type PoolRow,
  type PoolTone,
} from "./poolSummary";
import { usePoolCapacity } from "./usePoolCapacity";

/** 默认只列最紧的几个池；其余收在「显示全部」后面，渠道分组页的表格才有高度可用。 */
const COLLAPSED_ROWS = 3;

const CARD_CLASS = `p-4 [--cp-inner-radius:var(--radius-lg)] md:shrink-0 ${surface({ radius: "3xl" })}`;

// 分档和配色与 AI 账号卡的额度条一致：绿色是产品特色，只在余量吃紧时才换成琥珀和红。
const TONE_STYLE: Record<PoolTone, { fill: string; track: string; text: string }> = {
  healthy: {
    fill: "bg-accent bar-semantic:bg-gradient-to-r bar-semantic:from-emerald-400 bar-semantic:to-emerald-500 bar-semantic:dark:from-emerald-500 bar-semantic:dark:to-emerald-400",
    track: "bg-track bar-semantic:bg-emerald-500/12 bar-semantic:dark:bg-emerald-400/15",
    text: "text-ink",
  },
  warning: {
    fill: "bg-amber-500 dark:bg-amber-400 bar-semantic:bg-gradient-to-r bar-semantic:from-amber-300 bar-semantic:to-amber-500 bar-semantic:dark:from-amber-500 bar-semantic:dark:to-amber-300",
    track: "bg-track bar-semantic:bg-amber-500/15 bar-semantic:dark:bg-amber-400/15",
    text: "text-amber-700 dark:text-amber-300",
  },
  danger: {
    fill: "bg-rose-500 dark:bg-rose-400 bar-semantic:bg-gradient-to-r bar-semantic:from-rose-400 bar-semantic:to-rose-500 bar-semantic:dark:from-rose-500 bar-semantic:dark:to-rose-400",
    track: "bg-track bar-semantic:bg-rose-500/12 bar-semantic:dark:bg-rose-400/15",
    text: "text-rose-600 dark:text-rose-400",
  },
  unknown: { fill: "bg-ink-4", track: "bg-track", text: "text-ink-3" },
};

function PoolRowView({ row, nowMs, locale }: { row: PoolRow; nowMs: number; locale: string }) {
  const { t } = useTranslation();
  const style = TONE_STYLE[row.tone];
  const windowText = (KNOWN_WINDOW_KEYS as readonly string[]).includes(row.windowKey)
    ? t(`pool_capacity.window.${row.windowKey}`)
    : t("pool_capacity.window.unknown", { label: row.windowLabel || row.windowKey });
  const percent = row.remainingPercent === null ? null : Math.round(row.remainingPercent);

  const sentence =
    percent === null
      ? t("pool_capacity.sentence_no_data", { provider: row.providerName, window: windowText })
      : row.resetAtMs !== undefined
        ? t("pool_capacity.sentence", {
            provider: row.providerName,
            window: windowText,
            percent,
            reset: formatRelativeTime(row.resetAtMs, nowMs, locale),
          })
        : t("pool_capacity.sentence_no_reset", {
            provider: row.providerName,
            window: windowText,
            percent,
          });

  const projectionText =
    row.projection?.kind === "exhaustion"
      ? t("pool_capacity.projection_exhaustion", {
          time: formatClockTime(row.projection.atMs, nowMs, locale),
        })
      : row.projection?.kind === "safe"
        ? t("pool_capacity.projection_safe")
        : null;
  const coverageText = row.coverage
    ? t("pool_capacity.coverage", { withData: row.coverage.withData, total: row.coverage.total })
    : null;
  const staleText =
    row.stale && row.observedAtMs !== undefined
      ? t("pool_capacity.stale", { time: formatRelativeTime(row.observedAtMs, nowMs, locale) })
      : null;

  return (
    <li
      data-testid="pool-capacity-row"
      data-tone={row.tone}
      className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-2 first:pt-0 last:pb-0 sm:grid-cols-[1rem_minmax(0,1fr)_9rem]"
    >
      <span aria-hidden="true" className="flex size-4 items-center justify-center">
        <VendorIcon modelId={row.provider} size={16} />
      </span>
      <div className="min-w-0">
        <p className="text-sm leading-5 text-ink">{sentence}</p>
        {projectionText || coverageText || staleText ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-5 text-ink-3">
            {projectionText ? (
              // 「会用完」是要注意的；「用不完」只是补充，保持和其它说明同色。
              <span
                className={
                  row.projection?.kind === "exhaustion"
                    ? "font-medium text-amber-700 dark:text-amber-300"
                    : undefined
                }
              >
                {projectionText}
              </span>
            ) : null}
            {coverageText ? <span>{coverageText}</span> : null}
            {staleText ? (
              <span className="text-amber-700 dark:text-amber-300">{staleText}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      <div aria-hidden="true" className="col-start-2 flex items-center gap-2 sm:col-start-3">
        <div
          className={`relative h-bar-sm min-w-0 flex-1 overflow-hidden rounded-full ${style.track}`}
        >
          {percent ? (
            <div
              className={`absolute inset-y-0 left-0 rounded-full ${style.fill}`}
              style={{ width: `${percent}%` }}
            />
          ) : null}
        </div>
        <span
          className={`w-9 shrink-0 text-right text-sm font-semibold tabular-nums ${style.text}`}
        >
          {percent === null ? "--" : `${percent}%`}
        </span>
      </div>
    </li>
  );
}

/**
 * 池容量：按服务商和额度窗口，一句话说清「还剩多少、最早什么时候重置、照现在的速度几时用完」。
 *
 * 数字是池内各账号剩余百分比的平均（剩余口径，不是已用）。没有可汇总的池时整张卡不出现：
 * 没有 AI 账号的租户看到一张空卡只会困惑。
 *
 * 能力声明和权限都不在这里判断，由挂载处负责（features 不能依赖 app 层的权限）；这里被渲染就意味着
 * 可以请求。
 */
export function PoolCapacityCard() {
  const { t, i18n } = useTranslation();
  const { data, error, loading, reload } = usePoolCapacity();
  const [expanded, setExpanded] = useState(false);
  const locale = i18n.language;
  const nowMs = data?.fetchedAtMs ?? 0;
  const rows = useMemo(() => buildPoolRows(data?.pools ?? [], nowMs), [data, nowMs]);

  if (!data && loading) {
    return (
      <section aria-busy="true" aria-label={t("pool_capacity.title")} className={CARD_CLASS}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-4 w-3/5" />
      </section>
    );
  }
  // 读到了但没有池：不占地方。第一次就失败（data 为空、有 error）才继续往下，给出重试。
  if (data ? rows.length === 0 : !error) return null;

  const visible = expanded ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <section
      data-testid="pool-capacity-card"
      aria-label={t("pool_capacity.title")}
      className={CARD_CLASS}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Gauge size={16} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">{t("pool_capacity.title")}</h3>
            <p className="mt-0.5 text-xs text-ink-3">{t("pool_capacity.description")}</p>
          </div>
        </div>
        <Button
          size="xs"
          variant="ghost"
          onClick={reload}
          disabled={loading}
          aria-busy={loading || undefined}
          aria-label={t("pool_capacity.refresh")}
          title={t("pool_capacity.refresh")}
        >
          <RefreshCw
            size={14}
            className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
            aria-hidden="true"
          />
        </Button>
      </header>

      {error ? (
        <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">
          {t("pool_capacity.load_failed", { error })}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {visible.map((row) => (
            <PoolRowView key={row.id} row={row} nowMs={nowMs} locale={locale} />
          ))}
        </ul>
      ) : null}

      {rows.length > COLLAPSED_ROWS ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
        >
          {expanded
            ? t("pool_capacity.show_less")
            : t("pool_capacity.show_all", { total: rows.length })}
        </button>
      ) : null}
    </section>
  );
}
