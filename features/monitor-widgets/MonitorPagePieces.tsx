import type { ComponentType, ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  HOUR_WINDOWS,
  TIME_RANGES,
  type HourWindow,
  type TimeRange,
} from "@features/monitor-widgets/monitor-constants";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  useResizeLayoutAnimation,
  type TabsTone,
} from "@code-proxy/ui";

/**
 * `default` 是管理后台监控页一直在用的描边卡；`portal` 去掉阴影、加大圆角、
 * 标签与数值改等宽，与公开门户/落地页的视觉体系对齐。新增变体而不是直接改默认样式，
 * 避免一处调整波及所有监控页面。
 */
export type MonitorSurfaceTone = "default" | "portal";

const SURFACE_CLASS: Record<MonitorSurfaceTone, string> = {
  default:
    "rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]",
  portal:
    "rounded-3xl bg-white ring-1 ring-slate-900/8 dark:bg-white/[0.03] dark:ring-white/8",
};

export const KpiCard = ({
  title,
  value,
  hint,
  icon: Icon,
  valueClassName = "text-2xl",
  tone = "default",
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /** Optional size override when the value node does not carry its own text size. */
  valueClassName?: string;
  tone?: MonitorSurfaceTone;
}) => {
  const reduceMotion = useReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);

  return (
    <article
      ref={cardRef}
      className={`flex h-full min-w-0 flex-col p-5 ${SURFACE_CLASS[tone]}`}
    >
      <p
        className={
          tone === "portal"
            ? // 字距收窄 + 更小字号，长标签（TOTAL REQUESTS 等）才不会被截断成省略号
              "flex min-w-0 items-center gap-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate-400 dark:text-white/40"
            : "flex min-w-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55"
        }
      >
        <Icon
          size={14}
          className={
            tone === "portal"
              ? "shrink-0 text-indigo-600 dark:text-indigo-400"
              : "shrink-0 text-slate-900 dark:text-white"
          }
        />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <p
        className={`mt-3 min-w-0 overflow-hidden font-semibold tracking-tight text-slate-900 dark:text-white ${tone === "portal" ? "font-display font-bold" : ""} ${valueClassName}`}
      >
        {value}
      </p>
      <p className="mt-auto pt-2 text-xs text-slate-600 dark:text-white/65">{hint}</p>
    </article>
  );
};

export const TimeRangeSelector = ({
  value,
  onChange,
  tone = "neutral",
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
  /** 透传给底层 Tabs：门户传 brand 以跟随品牌主色。 */
  tone?: TabsTone;
}) => {
  const { t } = useTranslation();
  return (
    <Tabs
      value={String(value)}
      tone={tone}
      onValueChange={(next) => onChange(Number(next) as TimeRange)}
    >
      <TabsList>
        {TIME_RANGES.map((range) => {
          const label = range === 1 ? t("monitor.today") : t("monitor.n_days", { count: range });
          return (
            <TabsTrigger key={range} value={String(range)}>
              {label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
};

export const HourWindowSelector = ({
  value,
  onChange,
}: {
  value: HourWindow;
  onChange: (next: HourWindow) => void;
}) => {
  const { t } = useTranslation();
  return (
    <Tabs value={String(value)} onValueChange={(next) => onChange(Number(next) as HourWindow)}>
      <TabsList>
        {HOUR_WINDOWS.map((range) => (
          <TabsTrigger key={range} value={String(range)}>
            {t("monitor.last_nh", { count: range })}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

export const MonitorCard = ({
  title,
  description,
  actions,
  loading = false,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  tone?: MonitorSurfaceTone;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);

  return (
    <section
      ref={cardRef}
      className={`min-w-0 p-5 ${SURFACE_CLASS[tone]}`}
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3
            className={`text-sm font-semibold text-slate-900 dark:text-white ${tone === "portal" ? "font-display" : ""}`}
          >
            {title}
          </h3>
          {description ? (
            <p className="text-xs text-slate-600 dark:text-white/65">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="relative mt-4 min-w-0">
        {children}
        {loading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-sm dark:bg-neutral-950/45">
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/80"
            >
              <span
                className="h-4 w-4 rounded-full border-2 border-slate-300/80 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/85"
                aria-hidden="true"
              />
              <span className="tabular-nums">{t("common.loading")}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
