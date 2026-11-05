import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import {
  formatMonitorCompact,
  formatMonitorCount,
  formatMonitorDuration,
} from "../model/monitorFormat";
import {
  modelFirstTokenView,
  modelSpeedView,
  type ModelMetricView,
} from "../model/modelPerformance";
import type { RankingColumn } from "./MonitorRankingTable";

/**
 * 表头文字后跟一个说明图标：悬停或键盘聚焦都会弹出口径说明，读屏读的是图标的 aria-label。
 * 单元格里的数字说明用原生 title（和成功率那列一样），不给五十行表格加上百个 Tab 停靠点。
 */
function HeaderHint({ label, hint }: { label: string; hint: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <HoverTooltip content={hint} placement="top" className="shrink-0">
        <span
          tabIndex={0}
          role="img"
          aria-label={hint}
          className="inline-flex cursor-help rounded-full text-ink-4 transition-colors hover:text-ink-2 focus-visible:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <Info size={12} aria-hidden="true" />
        </span>
      </HoverTooltip>
    </span>
  );
}

/** 上行是 P50（或退回时的均值），下行是 P90（或「均值」二字）。 */
function MetricCell({
  view,
  format,
  title,
  averageLabel,
}: {
  view: ModelMetricView;
  format: (value: number) => string;
  title: string;
  averageLabel: string;
}) {
  if (view.kind === "none") {
    return (
      <span className="text-ink-4" title={title}>
        —
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end leading-tight" title={title}>
      <span className="text-ink-2">
        {format(view.kind === "quantiles" ? view.p50 : view.value)}
      </span>
      <span className="text-2xs text-ink-3">
        {view.kind === "quantiles" ? `P90 ${format(view.p90)}` : averageLabel}
      </span>
    </span>
  );
}

/** 模型性能榜的首字时间、生成速度和「首字 / 1K 输入」三列。 */
export function useModelPerformanceColumns() {
  const { t } = useTranslation();
  const averageLabel = t("monitor_center.ranking.average_label");
  const formatSpeed = (value: number) =>
    t("monitor_center.ranking.speed_value", { value: formatMonitorCompact(Math.round(value)) });

  const titleOf = (
    view: ModelMetricView,
    format: (value: number) => string,
    noSampleTitle: string,
    average: number | null,
  ) => {
    switch (view.kind) {
      case "quantiles": {
        const head = t("monitor_center.ranking.quantiles_title", {
          p50: format(view.p50),
          p90: format(view.p90),
          samples: formatMonitorCount(view.samples),
          count: view.samples,
        });
        return average === null
          ? head
          : `${head} · ${t("monitor_center.ranking.average_suffix", { value: format(average) })}`;
      }
      case "mean":
        return t("monitor_center.ranking.mean_only_title");
      default:
        return view.reason === "unsupported"
          ? t("monitor_center.ranking.speed_unsupported_title")
          : noSampleTitle;
    }
  };

  const firstToken: RankingColumn = {
    key: "first_token",
    header: (
      <HeaderHint
        label={t("monitor_center.ranking.first_token")}
        hint={t("monitor_center.ranking.first_token_hint")}
      />
    ),
    align: "right",
    className: "hidden w-24 xl:table-cell",
    render: (row) => {
      const view = modelFirstTokenView(row);
      return (
        <MetricCell
          view={view}
          format={formatMonitorDuration}
          averageLabel={averageLabel}
          title={titleOf(
            view,
            formatMonitorDuration,
            t("monitor_center.ranking.first_token_none_title"),
            row.first_token_avg_ms > 0 ? row.first_token_avg_ms : null,
          )}
        />
      );
    },
  };

  const speed: RankingColumn = {
    key: "speed",
    header: (
      <HeaderHint
        label={t("monitor_center.ranking.speed")}
        hint={t("monitor_center.ranking.speed_hint")}
      />
    ),
    align: "right",
    className: "hidden w-24 xl:table-cell",
    render: (row) => {
      const view = modelSpeedView(row);
      return (
        <MetricCell
          view={view}
          format={formatSpeed}
          averageLabel={averageLabel}
          title={titleOf(
            view,
            formatSpeed,
            t("monitor_center.ranking.speed_none_title"),
            row.generation_tokens_per_second,
          )}
        />
      );
    },
  };

  // 可选列，只在最宽的屏幕上出现：首字时间里有多少是在处理长上下文。
  const firstTokenPer1k: RankingColumn = {
    key: "first_token_per_1k",
    header: (
      <HeaderHint
        label={t("monitor_center.ranking.first_token_per_1k")}
        hint={t("monitor_center.ranking.first_token_per_1k_hint")}
      />
    ),
    align: "right",
    className: "hidden w-24 2xl:table-cell",
    render: (row) => {
      const value = row.performance?.first_token_ms_per_1k_input ?? null;
      return value === null ? (
        <span className="text-ink-4">—</span>
      ) : (
        <span className="text-ink-2">{formatMonitorDuration(value)}</span>
      );
    },
  };

  return { firstToken, speed, firstTokenPer1k };
}
