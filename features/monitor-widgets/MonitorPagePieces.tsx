import type { ComponentType, ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { TIME_RANGES, type TimeRange } from "@features/monitor-widgets/monitor-constants";
import {
  HUE_GLYPH,
  Tabs,
  TabsList,
  TabsTrigger,
  iconHueClass,
  useResizeLayoutAnimation,
  type Hue,
  type TabsTone,
  surface,
} from "@code-proxy/ui";

/**
 * `default` 是管理后台监控页的卡片；`portal` 标签与数值改等宽，与公开门户/落地页的视觉
 * 体系对齐。两者都是伪元素细边 + 投影的卡片，不画描边；内边距与 Card 默认档一致（p-4），
 * 卡片里贴角的子块可以用 rounded-inner 取同心圆角。
 */
export type MonitorSurfaceTone = "default" | "portal";

const SURFACE_CLASS: Record<MonitorSurfaceTone, string> = {
  default: surface({ radius: "3xl" }),
  portal: surface({ radius: "3xl" }),
};

export const KpiCard = ({
  title,
  value,
  hint,
  icon: Icon,
  hue,
  valueClassName = "text-2xl",
  tone = "default",
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /**
   * 图标的色相（图标着色为多彩时生效）：指标卡传该指标的身份色（请求蓝、成功绿、Token 紫、
   * 费用琥珀……）；不传时按全站「图标 → 色相」注册表取色，同一个图标到哪儿都是同一种颜色。
   */
  hue?: Hue;
  /** Optional size override when the value node does not carry its own text size. */
  valueClassName?: string;
  tone?: MonitorSurfaceTone;
}) => {
  const reduceMotion = useReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);

  return (
    <article
      ref={cardRef}
      className={`flex h-full min-w-0 flex-col p-4 ${SURFACE_CLASS[tone]}`}
    >
      <p
        className={
          tone === "portal"
            ? // 字距收窄 + 更小字号，长标签（TOTAL REQUESTS 等）才不会被截断成省略号
              "flex min-w-0 items-center gap-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-ink-3"
            : "flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink-3"
        }
      >
        <Icon size={14} className={`shrink-0 text-ink-3 ${hue ? HUE_GLYPH[hue] : iconHueClass(Icon)}`} />
        <span className="min-w-0 truncate">{title}</span>
      </p>
      <p
        className={`mt-3 min-w-0 overflow-hidden font-semibold tracking-tight text-ink ${tone === "portal" ? "font-display font-bold" : ""} ${valueClassName}`}
      >
        {value}
      </p>
      <p className="mt-auto pt-2 text-xs text-ink-2">{hint}</p>
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
      className={`min-w-0 p-4 [--cp-inner-radius:var(--radius-lg)] ${SURFACE_CLASS[tone]}`}
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3
            className={`text-sm font-semibold text-ink ${tone === "portal" ? "font-display" : ""}`}
          >
            {title}
          </h3>
          {description ? <p className="text-xs text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="relative mt-4 min-w-0">
        {children}
        {loading ? (
          // 与 Card 的加载遮罩同一套：卡片底色的半透明层 + 浮起的胶囊，不描边。
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-inner bg-surface/70 backdrop-blur-[2px]">
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-full bg-elevated px-4 py-2 text-sm font-medium text-ink-2 shadow-pop"
            >
              <span
                className="h-4 w-4 rounded-full border-2 border-ink/15 border-t-ink motion-reduce:animate-none motion-safe:animate-spin"
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
