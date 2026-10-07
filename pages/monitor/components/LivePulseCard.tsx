import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RadioTower } from "lucide-react";
import type { MonitorRealtime } from "@code-proxy/api-client";
import { AnimatedNumber, Card, EChart, Skeleton } from "@code-proxy/ui";
import { createRealtimeOption } from "../charts/realtimeOption";
import {
  formatMonitorCompact,
  formatMonitorDuration,
  formatMonitorPercent,
} from "../model/monitorFormat";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";
import { successTextClass } from "./monitorTheme";

interface LiveStat {
  key: string;
  label: string;
  value: number;
  format: (value: number) => string;
  className?: string;
  /** 没有样本时显示「—」而不是 0。 */
  empty?: boolean;
}

/** 实时流量：最近 60 分钟、每分钟的请求（成功 / 失败）与当前吞吐，15 秒刷新一次。 */
export function LivePulseCard({
  realtime,
  unavailable,
  isDark,
}: {
  realtime: MonitorRealtime | null;
  unavailable: boolean;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const option = useMemo(
    () =>
      realtime
        ? createRealtimeOption(realtime.points, isDark, {
            success: t("monitor_center.series.success"),
            failed: t("monitor_center.series.failed"),
            tokens: t("monitor_center.series.tokens"),
            latency: t("monitor_center.series.latency_avg"),
            inProgress: t("monitor_center.live.in_progress"),
          })
        : null,
    [isDark, realtime, t],
  );

  const title = (
    <MonitorCardTitle
      icon={RadioTower}
      hue="blue"
      label={t("monitor_center.live.title")}
      note={t("monitor_center.live.note")}
    />
  );

  if (unavailable) {
    return (
      <Card title={title} className="h-full">
        <MonitorInlineNotice
          icon={RadioTower}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.live.upgrade_hint")}
        />
      </Card>
    );
  }

  const last5m = realtime?.last_5m;
  const stats: LiveStat[] = realtime
    ? [
        {
          key: "rpm",
          label: t("monitor_center.live.current_rpm"),
          value: realtime.current_rpm,
          format: (value) => formatMonitorCompact(value),
        },
        {
          key: "peak",
          label: t("monitor_center.live.peak_rpm"),
          value: realtime.peak_rpm,
          format: (value) => formatMonitorCompact(value),
        },
        {
          key: "tpm",
          label: t("monitor_center.live.current_tpm"),
          value: realtime.current_tpm,
          format: (value) => formatMonitorCompact(value),
        },
        {
          key: "success",
          label: t("monitor_center.live.success_5m"),
          value: last5m?.success_rate ?? 0,
          format: (value) => formatMonitorPercent(value, value >= 99.995 ? 0 : 2),
          className: successTextClass(last5m?.success_rate ?? 0, last5m?.requests ?? 0),
          empty: !last5m?.requests,
        },
        {
          key: "latency",
          label: t("monitor_center.live.latency_5m"),
          value: last5m?.latency_avg_ms ?? 0,
          format: (value) => formatMonitorDuration(value),
          empty: !last5m?.latency_avg_ms,
        },
      ]
    : [];

  return (
    <Card title={title} className="h-full" bodyClassName="flex flex-col gap-4">
      {realtime ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.key} className="min-w-0">
              <dt className="truncate text-xs text-ink-3">{stat.label}</dt>
              <dd
                className={`mt-1 text-2xl leading-none font-semibold tracking-tight tabular-nums ${stat.className ?? "text-ink"}`}
              >
                {stat.empty ? (
                  <span className="text-ink-4">—</span>
                ) : (
                  <AnimatedNumber value={stat.value} format={stat.format} />
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-11" rounded="lg" />
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1">
        {option ? (
          <EChart option={option} className="h-36 min-h-full" replaceMerge="series" />
        ) : (
          <Skeleton className="h-36" rounded="lg" />
        )}
      </div>
    </Card>
  );
}
