import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNumber, Card } from "@code-proxy/ui";
import { GradientRing, MONITOR_HUES } from "@features/monitor-widgets/monitorVisuals";
import type {
  MonitorCheckLevel,
  MonitorHealthLevel,
  MonitorHealthReport,
} from "../model/monitorHealth";
import { MonitorCardTitle } from "./MonitorCardTitle";

const LEVEL_STYLE: Record<
  MonitorHealthLevel,
  { pill: string; hue: (typeof MONITOR_HUES)[keyof typeof MONITOR_HUES] | null; glow: string }
> = {
  healthy: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    hue: MONITOR_HUES.emerald,
    glow: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(16_185_129/0.13),transparent)]",
  },
  good: {
    pill: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    hue: MONITOR_HUES.emerald,
    glow: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(16_185_129/0.1),transparent)]",
  },
  warning: {
    pill: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    hue: MONITOR_HUES.amber,
    glow: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(245_158_11/0.15),transparent)]",
  },
  critical: {
    pill: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    hue: MONITOR_HUES.rose,
    glow: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(244_63_94/0.15),transparent)]",
  },
  idle: { pill: "bg-hover text-ink-3", hue: null, glow: "" },
};

const CHECK_ICON: Record<MonitorCheckLevel, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: "text-emerald-600 dark:text-emerald-300" },
  warn: { icon: CircleAlert, className: "text-amber-600 dark:text-amber-300" },
  critical: { icon: CircleX, className: "text-rose-600 dark:text-rose-300" },
  unknown: { icon: CircleDashed, className: "text-ink-4" },
};

/**
 * 健康评分：渐变环 + 逐项诊断。环与诊断用同一套颜色语义（绿正常、琥珀留意、红告急），
 * 顶部一层同色柔光让它在一排白卡片里成为视觉起点。没有流量时不打分，显示「空闲」。
 */
export function HealthCard({
  report,
  loading,
  legacy = false,
}: {
  report: MonitorHealthReport;
  loading: boolean;
  /** 旧后端：渠道与耗时检查缺数据是因为接口不存在，而不是上一周期没有数据。 */
  legacy?: boolean;
}) {
  const { t } = useTranslation();
  const style = LEVEL_STYLE[report.level];

  return (
    <Card
      loading={loading}
      className="h-full overflow-hidden"
      bodyClassName="flex h-full flex-col gap-4"
    >
      {style.glow ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-40 ${style.glow}`}
        />
      ) : null}
      {/* 标题自绘并置于柔光之上（Card 自带的标题行不在定位层里，会被柔光盖住）。 */}
      <div className="relative flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight text-ink">
          <MonitorCardTitle icon={HeartPulse} hue="emerald" label={t("monitor_center.health.title")} />
        </h3>
        <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${style.pill}`}>
          {t(`monitor_center.health.level_${report.level}`)}
        </span>
      </div>
      <div className="relative flex justify-center">
        <GradientRing
          value={report.score ?? 0}
          hue={style.hue ?? MONITOR_HUES.sky}
          className="size-32"
          strokeWidth={11}
        >
          {report.score !== null ? (
            <>
              <AnimatedNumber
                value={report.score}
                format={(value) => String(Math.round(value))}
                className="text-4xl font-semibold tracking-tight tabular-nums text-ink"
              />
              <span className="mt-0.5 text-2xs font-medium text-ink-3">/ 100</span>
            </>
          ) : (
            <span className="text-sm font-medium text-ink-3">
              {t("monitor_center.health.level_idle")}
            </span>
          )}
        </GradientRing>
      </div>
      <ul className="relative space-y-2.5">
        {report.checks.length === 0 ? (
          <li className="text-center text-xs text-ink-3">{t("monitor_center.health.idle_hint")}</li>
        ) : (
          report.checks.map((check) => {
            const { icon: Icon, className } = CHECK_ICON[check.level];
            return (
              <li key={check.key} className="flex items-start gap-2 text-xs leading-5">
                <Icon size={16} className={`mt-0.5 shrink-0 ${className}`} aria-hidden="true" />
                <span className="min-w-0 text-ink-2">
                  <span className="font-medium text-ink">
                    {t(`monitor_center.health.check_${check.key}`)}
                  </span>
                  <span className="mx-1 text-ink-4">·</span>
                  {legacy && check.level === "unknown"
                    ? t("monitor_center.needs_upgrade")
                    : t(`monitor_center.health.${check.key}_${check.level}`, check.values)}
                </span>
              </li>
            );
          })
        )}
      </ul>
    </Card>
  );
}
