import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Waypoints } from "lucide-react";
import type { MonitorOverview } from "@code-proxy/api-client";
import { Card, EChart } from "@code-proxy/ui";
import { withAlpha } from "../charts/chartBase";
import { createSankeyOption, flowLayerColor } from "../charts/sankeyOption";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatMonitorCompact } from "../model/monitorFormat";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";
import { metricColor } from "./monitorTheme";

interface CardProps {
  overview: MonitorOverview;
  legacy: boolean;
  loading: boolean;
  isDark: boolean;
}

/** 流量流向：谁 → 用了哪个模型 → 走了哪个渠道。 */
export function FlowSankeyCard({ overview, legacy, loading, isDark }: CardProps) {
  const { t } = useTranslation();
  const flows = overview.flows;
  const compact = useMediaQuery("(max-width: 639px)");
  const option = useMemo(
    () =>
      createSankeyOption(
        flows,
        isDark,
        {
          other: t("monitor_center.flows.other"),
          unknown: t("monitor_center.flows.unknown"),
          unnamed: t("monitor_center.unnamed_consumer"),
          requests: t("monitor_center.series.requests"),
          tokens: t("monitor_center.series.tokens"),
        },
        compact,
      ),
    [compact, flows, isDark, t],
  );

  return (
    <Card
      title={<MonitorCardTitle icon={Waypoints} label={t("monitor_center.flows.title")} />}
      actions={
        legacy ? null : (
          <span className="flex items-center gap-3 text-xs text-ink-3">
            {(["consumer", "model", "channel"] as const).map((layer) => (
              <span key={layer} className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: flowLayerColor(layer, isDark) }}
                  aria-hidden="true"
                />
                {t(`monitor_center.flows.layer_${layer}`)}
              </span>
            ))}
          </span>
        )
      }
      loading={loading}
      className="h-full"
    >
      {legacy ? (
        <MonitorInlineNotice
          icon={Waypoints}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.flows.upgrade_hint")}
        />
      ) : flows.links.length === 0 ? (
        <MonitorInlineNotice
          icon={Waypoints}
          title={t("monitor_center.empty.title")}
          className="h-72"
        />
      ) : (
        <EChart option={option} className="h-80" notMerge />
      )}
    </Card>
  );
}

// 周一在前：运维排班按工作周看。
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOUR_TICKS = new Set([0, 6, 12, 18]);

interface HoverCell {
  weekday: number;
  hour: number;
  x: number;
  y: number;
  align: "start" | "center" | "end";
}

/**
 * 活跃时段：星期 × 小时的请求热力格。看得出团队几点开工、夜里有没有自动化任务在跑，
 * 也能把一次异常放回「平时这个点是什么量」里去对比。颜色深浅只表示量，失败在提示里看。
 */
export function ActivityHeatmapCard({ overview, legacy, loading, isDark }: CardProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<HoverCell | null>(null);
  const base = metricColor("requests", isDark);

  const { matrix, max, peak, total, hourTotals } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ requests: 0, failed: 0 })),
    );
    let maxValue = 0;
    let peakCell: { weekday: number; hour: number; requests: number } | null = null;
    let sum = 0;
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const cell of overview.heatmap.cells) {
      if (cell.weekday < 0 || cell.weekday > 6 || cell.hour < 0 || cell.hour > 23) continue;
      grid[cell.weekday][cell.hour] = { requests: cell.requests, failed: cell.failed };
      byHour[cell.hour] += cell.requests;
      sum += cell.requests;
      if (cell.requests > maxValue) {
        maxValue = cell.requests;
        peakCell = { weekday: cell.weekday, hour: cell.hour, requests: cell.requests };
      }
    }
    return { matrix: grid, max: maxValue, peak: peakCell, total: sum, hourTotals: byHour };
  }, [overview.heatmap.cells]);

  const maxHour = Math.max(1, ...hourTotals);
  // 时间窗里每个星期几大约出现几次，用来把累计换算成「平均每周」。
  const weeks = Math.max(1, overview.heatmap.days / 7);
  const intensity = (value: number) => {
    if (value <= 0 || max <= 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((value / max) * 4)));
  };
  const cellColor = (level: number) =>
    level === 0 ? undefined : withAlpha(base, [0, 0.18, 0.38, 0.62, 0.92][level]);

  const describe = (weekday: number, hour: number) => {
    const cell = matrix[weekday][hour];
    const span = `${t(`monitor_center.heatmap.weekday_${weekday}`)} ${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
    return { span, cell };
  };

  const hovered = hover ? describe(hover.weekday, hover.hour) : null;

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={CalendarClock}
          label={t("monitor_center.heatmap.title")}
          note={t("monitor_center.heatmap.note", { days: overview.heatmap.days })}
        />
      }
      loading={loading}
      className="h-full"
      bodyClassName="flex flex-col gap-3"
    >
      {legacy ? (
        <MonitorInlineNotice
          icon={CalendarClock}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.heatmap.upgrade_hint")}
        />
      ) : total === 0 ? (
        <MonitorInlineNotice
          icon={CalendarClock}
          title={t("monitor_center.empty.title")}
          className="h-56"
        />
      ) : (
        <>
          <p className="text-xs text-ink-2">
            {peak
              ? t("monitor_center.heatmap.peak", {
                  span: describe(peak.weekday, peak.hour).span,
                  average: formatMonitorCompact(peak.requests / weeks),
                })
              : null}
          </p>
          <div
            ref={containerRef}
            className="relative"
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={t("monitor_center.heatmap.aria", { days: overview.heatmap.days })}
          >
            <div className="grid grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-[3px]">
              {WEEKDAY_ORDER.map((weekday) => (
                <HeatmapRow
                  key={weekday}
                  weekday={weekday}
                  label={t(`monitor_center.heatmap.weekday_short_${weekday}`)}
                  cells={matrix[weekday]}
                  colorFor={(value) => cellColor(intensity(value))}
                  active={hover?.weekday === weekday ? hover.hour : -1}
                  onHover={(hour, element) => {
                    const container = containerRef.current;
                    if (!container) return;
                    const box = container.getBoundingClientRect();
                    const rect = element.getBoundingClientRect();
                    const x = rect.left - box.left + rect.width / 2;
                    setHover({
                      weekday,
                      hour,
                      x,
                      y: rect.top - box.top,
                      align: x < 90 ? "start" : x > box.width - 90 ? "end" : "center",
                    });
                  }}
                />
              ))}
              {/* 按小时合计的剖面柱：与上面的热力格同列对齐，一眼看出一天里的起落。 */}
              <span className="mt-2" />
              {hourTotals.map((value, hour) => (
                <span
                  key={`profile-${hour}`}
                  className="mt-2 flex h-12 items-end"
                  title={`${String(hour).padStart(2, "0")}:00 · ${formatMonitorCompact(value)}`}
                >
                  <span
                    className="w-full rounded-sm bg-track transition-[height] duration-500 ease-pop"
                    style={{
                      height: `${Math.max(value > 0 ? 6 : 4, (value / maxHour) * 100)}%`,
                      backgroundColor: value > 0 ? withAlpha(base, 0.55) : undefined,
                    }}
                  />
                </span>
              ))}
              <span />
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour} className="pt-1 text-center text-2xs tabular-nums text-ink-3">
                  {HOUR_TICKS.has(hour) ? hour : ""}
                </span>
              ))}
            </div>
            {hover && hovered ? (
              <div
                className={[
                  "pointer-events-none absolute z-20 w-max rounded-xl bg-ink px-3 py-1.5 text-xs leading-snug text-canvas shadow-[0_8px_20px_-6px_rgb(0_0_0/0.28)]",
                  hover.align === "center"
                    ? "-translate-x-1/2"
                    : hover.align === "end"
                      ? "-translate-x-full"
                      : "",
                  "-translate-y-full",
                ].join(" ")}
                style={{ left: hover.x, top: hover.y - 6 }}
              >
                <div className="font-semibold">{hovered.span}</div>
                <div className="tabular-nums">
                  {t("monitor_center.heatmap.tooltip", {
                    total: formatMonitorCompact(hovered.cell.requests),
                    average: formatMonitorCompact(hovered.cell.requests / weeks),
                    failed: formatMonitorCompact(hovered.cell.failed),
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-2xs text-ink-3">
            <span className="mr-auto">{t("monitor_center.heatmap.profile")}</span>
            {t("monitor_center.heatmap.less")}
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="size-2.5 rounded-sm bg-track"
                style={level ? { backgroundColor: cellColor(level) } : undefined}
                aria-hidden="true"
              />
            ))}
            {t("monitor_center.heatmap.more")}
          </div>
        </>
      )}
    </Card>
  );
}

function HeatmapRow({
  weekday,
  label,
  cells,
  colorFor,
  active,
  onHover,
}: {
  weekday: number;
  label: string;
  cells: { requests: number; failed: number }[];
  colorFor: (value: number) => string | undefined;
  active: number;
  onHover: (hour: number, element: HTMLElement) => void;
}) {
  return (
    <>
      <span className="pr-1.5 text-2xs leading-none text-ink-3 self-center">{label}</span>
      {cells.map((cell, hour) => (
        <span
          key={`${weekday}-${hour}`}
          onMouseEnter={(event) => onHover(hour, event.currentTarget)}
          className={[
            "aspect-square rounded-sm bg-track transition-[box-shadow] duration-150",
            active === hour ? "shadow-[0_0_0_1.5px_var(--cp-ink)]" : "",
          ].join(" ")}
          style={cell.requests > 0 ? { backgroundColor: colorFor(cell.requests) } : undefined}
        />
      ))}
    </>
  );
}
