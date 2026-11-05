import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Hourglass } from "lucide-react";
import {
  MONITOR_IN_FLIGHT_STAGES,
  type MonitorInFlight,
  type MonitorInFlightAccount,
  type MonitorInFlightRequest,
} from "@code-proxy/api-client";
import { Card, ScrollArea } from "@code-proxy/ui";
import { formatMonitorDuration } from "../model/monitorFormat";
import { usePageVisible } from "../hooks/usePageVisible";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";

/**
 * 卡在同一阶段超过这么久就标出来：排队、等恢复、等上游、等首 token 都不该这么久。流式中不算，
 * 长回答本来就要一直传。
 */
export const IN_FLIGHT_SLOW_STAGE_MS = 15_000;

const KNOWN_STAGES: ReadonlySet<string> = new Set(MONITOR_IN_FLIGHT_STAGES);

// 阶段小标签：状态色淡底，深浅色由同一组类名覆盖（与请求详情的小标签同一套）。
const STAGE_TONE: Record<string, string> = {
  preparing: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  queued: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  waiting: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  upstream: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  first_token: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  streaming: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};
const NEUTRAL_TONE = STAGE_TONE.preparing;

const pad = (value: number) => String(value).padStart(2, "0");

/** 开始时刻按浏览器本地时间显示到秒：在途请求都是刚刚开始的，不用写日期。 */
function clockOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || "—";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 悬停提示：完整的渠道名（OAuth 邮箱常被截断）和它背后的账号 id。 */
function accountTitle(account: MonitorInFlightAccount): string {
  const label = account.label && account.label !== account.auth_id ? account.label : "";
  return [label, account.auth_id].filter(Boolean).join("\n");
}

/**
 * 正在进行的请求（只含本节点）：处在哪个阶段、在这一阶段多久了、在哪个账号上、哪个 Key 发来的。
 * 列表每 5 秒刷新，两次之间的耗时每秒往上走；页面在后台时都停下。
 */
export function InFlightCard({
  inFlight,
  receivedAt,
  error,
}: {
  inFlight: MonitorInFlight | null;
  receivedAt: number;
  error: boolean;
}) {
  const { t } = useTranslation();
  const visible = usePageVisible();
  const [now, setNow] = useState(() => Date.now());
  const requests = inFlight?.requests ?? [];
  const ticking = visible && requests.length > 0;

  useEffect(() => {
    if (!ticking) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [ticking, receivedAt]);

  const since = receivedAt > 0 ? Math.max(0, now - receivedAt) : 0;
  const total = inFlight?.total ?? 0;

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={Hourglass}
          label={t("monitor_center.in_flight.title")}
          note={
            inFlight
              ? total > requests.length
                ? t("monitor_center.in_flight.note_listed", { shown: requests.length, total })
                : t("monitor_center.in_flight.note", { count: total })
              : undefined
          }
        />
      }
      loading={!inFlight && !error}
      bodyClassName="flex flex-col gap-2"
    >
      {error && !inFlight ? (
        <MonitorInlineNotice
          icon={Hourglass}
          title={t("monitor_center.in_flight.load_failed")}
          className="py-6"
        />
      ) : requests.length === 0 ? (
        <MonitorInlineNotice
          icon={CircleCheck}
          title={t("monitor_center.in_flight.empty")}
          description={t("monitor_center.in_flight.empty_hint")}
          className="py-6"
        />
      ) : (
        <ScrollArea viewportClassName="max-h-96" edgeFade scrollbarVisibility="hover">
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {(["started", "stage", "request", "account", "key"] as const).map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="border-b border-line px-2.5 pb-2 text-left text-xs font-medium whitespace-nowrap text-ink-3"
                    >
                      {t(`monitor_center.in_flight.col_${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((request, index) => (
                  <InFlightRow
                    key={request.request_id || `row-${index}`}
                    request={request}
                    since={since}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}

function InFlightRow({ request, since }: { request: MonitorInFlightRequest; since: number }) {
  const { t } = useTranslation();
  const elapsed = request.elapsed_ms + since;
  const inStage = request.stage_elapsed_ms + since;
  const known = KNOWN_STAGES.has(request.stage);
  const slow = known && request.stage !== "streaming" && inStage >= IN_FLIGHT_SLOW_STAGE_MS;
  const account = request.account;
  const cell = "border-b border-line px-2.5 py-2 align-top";
  return (
    <tr data-testid="in-flight-row" data-slow={slow ? "true" : undefined}>
      <td className={`${cell} whitespace-nowrap`} title={request.request_id || undefined}>
        <span className="block tabular-nums text-ink">{clockOf(request.started_at)}</span>
        <span className="block text-xs tabular-nums text-ink-3">
          {t("monitor_center.in_flight.elapsed", { duration: formatMonitorDuration(elapsed) })}
        </span>
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        <span
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_TONE[request.stage] ?? NEUTRAL_TONE}`}
        >
          {known ? t(`monitor_center.in_flight.stage.${request.stage}`) : request.stage || "—"}
        </span>
        <span
          className={`mt-0.5 block text-xs tabular-nums ${slow ? "font-medium text-amber-700 dark:text-amber-300" : "text-ink-3"}`}
          title={slow ? t("monitor_center.in_flight.slow_hint") : undefined}
        >
          {t("monitor_center.in_flight.in_stage", { duration: formatMonitorDuration(inStage) })}
        </span>
      </td>
      <td className={`${cell} max-w-0 w-[34%]`}>
        <span className="block truncate text-ink" title={request.model || undefined}>
          {request.model || "—"}
          {request.stream ? (
            <span className="text-ink-3"> · {t("monitor_center.in_flight.stream")}</span>
          ) : null}
        </span>
        <span
          className="block truncate font-mono text-xs text-ink-3"
          title={request.path || undefined}
        >
          {[request.method, request.path].filter(Boolean).join(" ") || "—"}
        </span>
      </td>
      <td className={`${cell} max-w-0 w-[30%]`}>
        {account ? (
          <>
            <span className="block truncate text-ink" title={accountTitle(account)}>
              {account.label || account.auth_id}
              {account.provider ? <span className="text-ink-3"> · {account.provider}</span> : null}
            </span>
            <span className="block truncate text-xs text-ink-3">
              {[
                request.attempt > 0
                  ? t("monitor_center.in_flight.attempt", { attempt: request.attempt })
                  : "",
                account.group ? t("monitor_center.in_flight.group", { group: account.group }) : "",
                account.model && account.model !== request.model ? account.model : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-3">{t("monitor_center.in_flight.no_account")}</span>
        )}
      </td>
      <td className={`${cell} max-w-0 w-[16%]`}>
        <span className="block truncate text-ink-2" title={request.api_key_id || undefined}>
          {request.api_key_name || request.api_key_id || "—"}
        </span>
      </td>
    </tr>
  );
}
