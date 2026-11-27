import { useTranslation } from "react-i18next";
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
      <span className="text-sn-label-off" title={title}>
        —
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end leading-tight" title={title}>
      <span className="text-sn-label2">
        {format(view.kind === "quantiles" ? view.p50 : view.value)}
      </span>
      <span className="text-2xs text-sn-label3">
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
    header: t("monitor_center.ranking.first_token"),
    headerHint: t("monitor_center.ranking.first_token_hint"),
    align: "right",
    width: 96,
    minBreakpoint: "xl",
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
    header: t("monitor_center.ranking.speed"),
    headerHint: t("monitor_center.ranking.speed_hint"),
    align: "right",
    width: 96,
    minBreakpoint: "xl",
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
    header: t("monitor_center.ranking.first_token_per_1k"),
    headerHint: t("monitor_center.ranking.first_token_per_1k_hint"),
    align: "right",
    width: 96,
    minBreakpoint: "2xl",
    render: (row) => {
      const value = row.performance?.first_token_ms_per_1k_input ?? null;
      return value === null ? (
        <span className="text-sn-label-off">—</span>
      ) : (
        <span className="text-sn-label2">{formatMonitorDuration(value)}</span>
      );
    },
  };

  return { firstToken, speed, firstTokenPer1k };
}
