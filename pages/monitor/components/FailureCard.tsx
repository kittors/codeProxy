import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, FileWarning, OctagonAlert } from "lucide-react";
import type { MonitorBreakdownRow, MonitorOverview } from "@code-proxy/api-client";
import { Card, ScrollArea, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { ErrorDetailModal } from "@features/log-content-viewer";
import { MeterBar, meterTone } from "@features/monitor-widgets/monitorVisuals";
import {
  formatMonitorCompact,
  formatMonitorDuration,
  formatMonitorLocalTime,
  formatMonitorPercent,
} from "../model/monitorFormat";
import type { MonitorFilterDimension } from "../model/monitorQueryState";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";

const SOURCE_DIMENSIONS: MonitorFilterDimension[] = ["channels", "models", "consumers"];

/**
 * 失败分析：失败从哪里来（渠道 / 模型 / 门户用户），以及最近的失败请求。
 * 不按 HTTP 状态码分类——流式请求中途失败时记下的状态仍是 200，那个分类会误导；
 * 上游报错原文在错误详情里，点开即看。
 */
export function FailureCard({
  overview,
  legacy,
  loading,
  canViewDetail,
  activeFilters,
  onSelect,
}: {
  overview: MonitorOverview;
  legacy: boolean;
  loading: boolean;
  canViewDetail: boolean;
  activeFilters: Record<MonitorFilterDimension, string[]>;
  onSelect: (dimension: MonitorFilterDimension, value: string) => void;
}) {
  const { t } = useTranslation();
  const [dimension, setDimension] = useState<MonitorFilterDimension>("channels");
  const [detail, setDetail] = useState<{ id: number; model: string } | null>(null);
  const current = overview.summary.current;
  const failureRate = current.requests > 0 ? (current.failed / current.requests) * 100 : 0;
  const sources = overview[dimension].rows
    .filter((row) => row.failed > 0)
    .sort((a, b) => b.failed - a.failed || a.success_rate - b.success_rate)
    .slice(0, 5);

  const labelOf = (row: MonitorBreakdownRow) =>
    row.label ||
    (dimension === "channels"
      ? t("monitor_center.unknown_channel")
      : dimension === "consumers"
        ? t("monitor_center.unnamed_consumer")
        : row.key);

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={OctagonAlert}
          hue="rose"
          label={t("monitor_center.failures.title")}
          note={
            current.failed > 0
              ? t("monitor_center.failures.note", {
                  failed: formatMonitorCompact(current.failed),
                  rate: formatMonitorPercent(failureRate),
                })
              : undefined
          }
        />
      }
      actions={
        legacy || current.failed === 0 ? null : (
          <Tabs
            value={dimension}
            onValueChange={(next) => setDimension(next as MonitorFilterDimension)}
            size="sm"
          >
            <TabsList aria-label={t("monitor_center.failures.source_label")}>
              {SOURCE_DIMENSIONS.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(`monitor_center.filter.${item}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )
      }
      loading={loading}
      className="h-full"
      bodyClassName="flex flex-col gap-4"
    >
      {current.failed === 0 ? (
        <MonitorInlineNotice
          icon={CircleCheck}
          title={t("monitor_center.failures.none")}
          description={current.requests > 0 ? t("monitor_center.failures.none_hint") : undefined}
        />
      ) : legacy ? (
        <MonitorInlineNotice
          icon={FileWarning}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.failures.upgrade_hint", {
            failed: formatMonitorCompact(current.failed),
          })}
        />
      ) : (
        <>
          <section aria-label={t("monitor_center.failures.sources")} className="space-y-1">
            <h4 className="text-xs font-medium text-ink-3">
              {t("monitor_center.failures.sources")}
            </h4>
            {sources.length === 0 ? (
              <p className="py-2 text-xs text-ink-3">
                {t("monitor_center.failures.sources_empty")}
              </p>
            ) : (
              sources.map((row) => {
                const rowRate = row.requests > 0 ? (row.failed / row.requests) * 100 : 0;
                const selected = row.key !== "" && activeFilters[dimension].includes(row.key);
                return (
                  <button
                    key={`${dimension}:${row.key}:${row.label}`}
                    type="button"
                    disabled={row.key === ""}
                    onClick={() => onSelect(dimension, row.key)}
                    aria-pressed={selected}
                    title={t("monitor_center.click_to_filter")}
                    className={[
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                      selected ? "bg-selected" : "hover:bg-hover",
                      "disabled:cursor-default disabled:hover:bg-transparent",
                    ].join(" ")}
                  >
                    <span className="truncate text-sm text-ink">{labelOf(row)}</span>
                    <span className="text-xs tabular-nums text-ink-2">
                      <span className="font-semibold text-rose-600 dark:text-rose-300">
                        {formatMonitorCompact(row.failed)}
                      </span>
                      <span className="text-ink-4"> / {formatMonitorCompact(row.requests)}</span>
                      <span className="ml-2 inline-block w-12 text-right">
                        {formatMonitorPercent(rowRate, 1)}
                      </span>
                    </span>
                    <span className="col-span-2">
                      <MeterBar pct={rowRate} tone={meterTone("critical")} className="h-bar-sm" />
                    </span>
                  </button>
                );
              })
            )}
          </section>

          <section aria-label={t("monitor_center.failures.recent")} className="min-h-0 space-y-1">
            <h4 className="text-xs font-medium text-ink-3">
              {t("monitor_center.failures.recent")}
            </h4>
            {overview.recent_failures.length === 0 ? (
              <p className="py-2 text-xs text-ink-3">{t("monitor_center.failures.recent_empty")}</p>
            ) : (
              <ScrollArea viewportClassName="max-h-60" edgeFade scrollbarVisibility="hover">
                <ul className="divide-y divide-line">
                  {overview.recent_failures.map((failure) => (
                    <li key={failure.id} className="flex items-center gap-3 py-2 text-xs">
                      <span className="w-28 shrink-0 tabular-nums text-ink-3">
                        {formatMonitorLocalTime(failure.timestamp)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {failure.model || "—"}
                        </span>
                        <span className="block truncate text-ink-3">
                          {[
                            failure.channel || t("monitor_center.unknown_channel"),
                            failure.consumer,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink-2">
                        {failure.latency_ms > 0 ? formatMonitorDuration(failure.latency_ms) : "—"}
                      </span>
                      {canViewDetail ? (
                        <button
                          type="button"
                          onClick={() => setDetail({ id: failure.id, model: failure.model })}
                          className="shrink-0 rounded-full px-2 py-1 font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink"
                        >
                          {t("monitor_center.failures.view_detail")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </section>
        </>
      )}
      <ErrorDetailModal
        open={detail !== null}
        logId={detail?.id ?? null}
        model={detail?.model}
        onClose={() => setDetail(null)}
      />
    </Card>
  );
}
