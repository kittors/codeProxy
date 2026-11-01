import { useTranslation } from "react-i18next";
import { Ban, Check, RefreshCw, X, type LucideIcon } from "lucide-react";
import type {
  AlertDeliveryStatus,
  AlertEvent,
  AlertEventDelivery,
  AlertSeverity,
} from "@code-proxy/api-client";
import { Button, Callout, EmptyState, SkeletonLines, surface } from "@code-proxy/ui";
import { formatEventTime } from "./eventFormat";

// 语义色只用淡底 + 同色字（和 IP 防护的尝试记录同一套），深色下换浅一档的字色。
const SEVERITY_TONE: Record<AlertSeverity, string> = {
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

const DELIVERY_TONE: Record<AlertDeliveryStatus, { chip: string; icon: LucideIcon }> = {
  sent: { chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", icon: Check },
  failed: { chip: "bg-rose-500/10 text-rose-700 dark:text-rose-300", icon: X },
  dropped: { chip: "bg-amber-500/10 text-amber-800 dark:text-amber-200", icon: Ban },
};

function DeliveryItem({ delivery }: { delivery: AlertEventDelivery }) {
  const { t } = useTranslation();
  // 状态不只靠颜色和图标：读屏和黑白打印都要能读出「发出去了没有」。
  const tone = DELIVERY_TONE[delivery.status] ?? DELIVERY_TONE.failed;
  const Icon = tone.icon;
  const reason =
    delivery.error ||
    (delivery.status === "dropped" ? t("alerts_page.events.delivery.dropped_hint") : "");
  return (
    <li className="min-w-0">
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-2xs font-medium ${tone.chip}`}
      >
        <Icon size={11} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{delivery.channel_name || delivery.channel_id}</span>
        <span className="sr-only">
          {t(`alerts_page.events.delivery.${delivery.status}`, {
            defaultValue: delivery.status,
          })}
        </span>
      </span>
      {reason ? (
        <span className="mt-0.5 block break-words text-2xs leading-4 text-ink-3" title={reason}>
          {reason}
        </span>
      ) : null}
    </li>
  );
}

/**
 * 「最近记录」：后端留最近 200 条，这里取最新的一页。每行是一次告警（或一次测试发送）和它在各个通道上
 * 的投递结果；失败的通道把后端给的简短原因写在旁边，不需要翻服务端日志。
 */
export function EventsPanel({
  items,
  total,
  error,
  loading,
  onReload,
}: {
  /** null：还没读到过。 */
  items: AlertEvent[] | null;
  total: number;
  error: string;
  loading: boolean;
  onReload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en";

  return (
    <section
      aria-labelledby="alerts-events-title"
      className={`p-4 [--cp-inner-radius:var(--radius-lg)] ${surface({ radius: "3xl" })}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="alerts-events-title" className="text-sm font-semibold text-ink">
            {t("alerts_page.events.title")}
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {items && items.length > 0
              ? t("alerts_page.events.summary", { shown: items.length, total })
              : t("alerts_page.events.desc")}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          aria-busy={loading}
          onClick={onReload}
        >
          <RefreshCw
            size={14}
            aria-hidden="true"
            className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
          />
          {t("alerts_page.events.refresh")}
        </Button>
      </header>

      {error ? (
        <Callout tone="danger" role="alert" className="mt-3">
          {t("alerts_page.events.load_failed", { error })}
        </Callout>
      ) : null}

      {items === null ? (
        error ? null : (
          <SkeletonLines rows={5} className="mt-4" />
        )
      ) : items.length === 0 ? (
        <EmptyState
          title={t("alerts_page.events.empty_title")}
          description={t("alerts_page.events.empty_desc")}
        />
      ) : (
        <div className="-mx-1 mt-3 overflow-x-auto px-1">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {(["time", "rule", "severity", "subject", "title", "deliveries"] as const).map(
                  (column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-line px-2.5 pb-2 text-left text-xs font-medium whitespace-nowrap text-ink-3"
                    >
                      {t(`alerts_page.events.column.${column}`)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((event) => {
                const time = formatEventTime(event.at, locale);
                const deliveries = event.deliveries ?? [];
                return (
                  <tr key={event.id} data-testid="alert-event-row">
                    <td className="border-b border-line px-2.5 py-2.5 align-top whitespace-nowrap">
                      <time
                        dateTime={event.at}
                        title={time.full}
                        className="tabular-nums text-ink-2"
                      >
                        {time.short}
                      </time>
                    </td>
                    <td className="border-b border-line px-2.5 py-2.5 align-top whitespace-nowrap text-ink">
                      {t(`alerts_page.events.rule.${event.rule}`, { defaultValue: event.rule })}
                    </td>
                    <td className="border-b border-line px-2.5 py-2.5 align-top whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 py-px text-2xs font-medium ${SEVERITY_TONE[event.severity] ?? SEVERITY_TONE.info}`}
                      >
                        {t(`alerts_page.events.severity.${event.severity}`, {
                          defaultValue: event.severity,
                        })}
                      </span>
                    </td>
                    <td className="max-w-[12rem] border-b border-line px-2.5 py-2.5 align-top">
                      <span
                        className="block truncate text-ink"
                        title={event.subject.name || event.subject.id}
                      >
                        {event.subject.name || event.subject.id}
                      </span>
                      <span className="block text-2xs text-ink-3">
                        {t(`alerts_page.events.subject.${event.subject.kind}`, {
                          defaultValue: event.subject.kind,
                        })}
                      </span>
                    </td>
                    <td className="w-full min-w-[14rem] border-b border-line px-2.5 py-2.5 align-top">
                      <span className="block font-medium text-ink">{event.title}</span>
                      {event.text && event.text !== event.title ? (
                        <span
                          className="mt-0.5 line-clamp-2 block text-xs leading-5 text-ink-3"
                          title={event.text}
                        >
                          {event.text}
                        </span>
                      ) : null}
                    </td>
                    <td className="min-w-[10rem] border-b border-line px-2.5 py-2.5 align-top">
                      {deliveries.length === 0 ? (
                        <span className="text-xs text-ink-3">
                          {t("alerts_page.events.delivery.none")}
                        </span>
                      ) : (
                        <ul className="space-y-1.5">
                          {deliveries.map((delivery) => (
                            <DeliveryItem
                              key={`${delivery.channel_id}:${delivery.status}`}
                              delivery={delivery}
                            />
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
