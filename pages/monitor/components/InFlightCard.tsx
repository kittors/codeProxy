import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, Hourglass } from "@code-proxy/ui/icons";
import {
  MONITOR_IN_FLIGHT_STAGES,
  type MonitorInFlight,
  type MonitorInFlightAccount,
  type MonitorInFlightRequest,
} from "@code-proxy/api-client";
import { Card, DataGrid, type DataGridColumn } from "@code-proxy/ui";
import { formatMonitorDuration } from "../model/monitorFormat";
import { useLiveNow } from "../hooks/useLiveNow";
import { usePageVisible } from "../hooks/usePageVisible";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";

/**
 * 卡在同一阶段超过这么久就标出来：排队、等恢复、等上游、等首 token 都不该这么久。流式中不算，
 * 长回答本来就要一直传。
 */
export const IN_FLIGHT_SLOW_STAGE_MS = 15_000;

const KNOWN_STAGES: ReadonlySet<string> = new Set(MONITOR_IN_FLIGHT_STAGES);

// 阶段小标签：状态色淡底加同色圆点，深浅色由同一组类名覆盖（与请求详情的小标签同一套）。
// 圆点是静止的：这张表每 5 秒刷新，任何闪烁、呼吸效果都会让整张表看起来在跳。
const STAGE_TONE: Record<string, string> = {
  preparing: "bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]",
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
 * 请求打到的是哪类接口：路径的最后一段就够认（chat/completions、responses、messages、
 * :streamGenerateContent）。完整路径带着渠道分组前缀，又长又杂，放进悬停提示。
 */
export function endpointOf(path: string): string {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  if (!clean) return "";
  const action = clean.lastIndexOf(":");
  if (action > clean.lastIndexOf("/")) return clean.slice(action + 1);
  if (clean.endsWith("/chat/completions")) return "chat/completions";
  if (clean.endsWith("/images/generations")) return "images/generations";
  return clean.slice(clean.lastIndexOf("/") + 1);
}

/** 开始得越晚越靠上：新请求出现在顶端，把旧的往下推。 */
function newestFirst(requests: readonly MonitorInFlightRequest[], receivedAt: number): MonitorInFlightRequest[] {
  const startedAt = (request: MonitorInFlightRequest) => {
    const parsed = Date.parse(request.started_at);
    return Number.isNaN(parsed) ? receivedAt - request.elapsed_ms : parsed;
  };
  return [...requests].sort(
    (a, b) => startedAt(b) - startedAt(a) || b.request_id.localeCompare(a.request_id),
  );
}

/** 距上次拉取过了多久由共享时钟算（useLiveNow），只有耗时文字每秒更新，表格本身不重渲染。 */
const InFlightClock = createContext<{ receivedAt: number; running: boolean }>({ receivedAt: 0, running: false });

function Running({ baseMs, children }: { baseMs: number; children: (ms: number) => ReactNode }) {
  const { receivedAt, running } = useContext(InFlightClock);
  const now = useLiveNow(running);
  return <>{children(baseMs + (receivedAt > 0 ? Math.max(0, now - receivedAt) : 0))}</>;
}

/**
 * 正在进行的请求（只含本节点）：处在哪个阶段、在这一阶段多久了、在哪个账号上、哪个 Key 发来的。
 * 列表每 5 秒刷新，最新的在最上面；新请求从顶端浮入、旧的往下让，结束的原地淡出后收起。两次刷新
 * 之间耗时每秒往上走，页面在后台时都停下。
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
  const requests = inFlight?.requests;
  const rows = useMemo(() => newestFirst(requests ?? [], receivedAt), [requests, receivedAt]);
  const running = visible && rows.length > 0;
  const clock = useMemo(() => ({ receivedAt, running }), [receivedAt, running]);
  const total = inFlight?.total ?? 0;
  const columns = useInFlightColumns();
  const view = error && !inFlight ? "error" : rows.length === 0 ? "empty" : "table";

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={Hourglass}
          label={t("monitor_center.in_flight.title")}
          note={
            inFlight
              ? total > rows.length
                ? t("monitor_center.in_flight.note_listed", { shown: rows.length, total })
                : t("monitor_center.in_flight.note", { count: total })
              : undefined
          }
        />
      }
      loading={!inFlight && !error}
    >
      <div key={view} className="sn-fade-up">
          {view === "error" ? (
            <MonitorInlineNotice
              icon={Hourglass}
              title={t("monitor_center.in_flight.load_failed")}
              className="py-6"
            />
          ) : view === "empty" ? (
            <MonitorInlineNotice
              icon={CircleCheck}
              title={t("monitor_center.in_flight.empty")}
              description={t("monitor_center.in_flight.empty_hint")}
              className="py-6"
            />
          ) : (
            // 卡片里的小表：不再套外框，按行收高、最高 24rem 后表内滚动；放不下时横向在表格里滚。
            <InFlightClock.Provider value={clock}>
              <DataGrid<MonitorInFlightRequest>
                frame={false}
                label={t("monitor_center.in_flight.title")}
                columns={columns}
                rows={rows}
                rowKey={(request) => request.request_id || `${request.started_at}-${request.path}`}
                maxHeight="24rem"
                rowMotion="live"
              />
            </InFlightClock.Provider>
          )}
      </div>
    </Card>
  );
}

/**
 * 在途请求的列。不随时间重建：耗时由各自的 Running 每秒更新，列和行保持不变，表格不会每秒重排。
 * 单元格里的截断文字自带原生 title（完整渠道名 + 账号 id、完整路径），不再叠表格的截断提示。
 */
function useInFlightColumns(): DataGridColumn<MonitorInFlightRequest>[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        id: "started",
        header: t("monitor_center.in_flight.col_started"),
        width: 120,
        overflowTooltip: false,
        cell: (request) => (
          <span className="flex flex-col whitespace-nowrap" title={request.request_id || undefined}>
            <span className="tabular-nums text-sn-label">{clockOf(request.started_at)}</span>
            <span className="text-xs tabular-nums text-sn-label3">
              <Running baseMs={request.elapsed_ms}>
                {(ms) => t("monitor_center.in_flight.elapsed", { duration: formatMonitorDuration(ms) })}
              </Running>
            </span>
          </span>
        ),
      },
      {
        id: "stage",
        header: t("monitor_center.in_flight.col_stage"),
        width: 156,
        overflowTooltip: false,
        cell: (request) => {
          const known = KNOWN_STAGES.has(request.stage);
          return (
            <span className="flex flex-col items-start whitespace-nowrap">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_TONE[request.stage] ?? NEUTRAL_TONE}`}
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-80" />
                {known ? t(`monitor_center.in_flight.stage.${request.stage}`) : request.stage || "—"}
              </span>
              <Running baseMs={request.stage_elapsed_ms}>
                {(inStage) => {
                  const slow = known && request.stage !== "streaming" && inStage >= IN_FLIGHT_SLOW_STAGE_MS;
                  return (
                    <span
                      data-slow={slow ? "true" : undefined}
                      className={`mt-1 text-xs tabular-nums transition-colors duration-300 ${slow ? "font-medium text-amber-700 dark:text-amber-300" : "text-sn-label3"}`}
                      title={slow ? t("monitor_center.in_flight.slow_hint") : undefined}
                    >
                      {t("monitor_center.in_flight.in_stage", { duration: formatMonitorDuration(inStage) })}
                    </span>
                  );
                }}
              </Running>
            </span>
          );
        },
      },
      {
        id: "request",
        header: t("monitor_center.in_flight.col_request"),
        width: 220,
        grow: 1.2,
        overflowTooltip: false,
        cell: (request) => {
          const route = [request.method, request.path].filter(Boolean).join(" ");
          const endpoint = endpointOf(request.path);
          return (
            <span className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sn-label" title={request.model || undefined}>
                  {request.model || "—"}
                </span>
                {request.stream ? (
                  <span className="shrink-0 rounded-md bg-sn-label/[0.05] px-1.5 text-2xs leading-5 text-sn-label2 dark:bg-white/[0.07]">
                    {t("monitor_center.in_flight.stream")}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 truncate text-xs text-sn-label3" title={route || undefined}>
                {endpoint || route || "—"}
              </span>
            </span>
          );
        },
      },
      {
        id: "account",
        header: t("monitor_center.in_flight.col_account"),
        width: 200,
        grow: 1,
        overflowTooltip: false,
        cell: (request) => {
          const account = request.account;
          if (!account) {
            return <span className="text-xs text-sn-label3">{t("monitor_center.in_flight.no_account")}</span>;
          }
          // 第一次尝试是常态，不写；重试了才写「第 n 次尝试」并标琥珀色。
          const retried = request.attempt > 1;
          const details = [
            account.group ? t("monitor_center.in_flight.group", { group: account.group }) : "",
            account.model && account.model !== request.model ? account.model : "",
          ].filter(Boolean);
          return (
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sn-label" title={accountTitle(account)}>
                {account.label || account.auth_id}
                {account.provider ? <span className="text-sn-label3"> · {account.provider}</span> : null}
              </span>
              {retried || details.length > 0 ? (
                <span className="mt-0.5 truncate text-xs text-sn-label3">
                  {retried ? (
                    <span className="font-medium text-amber-700 dark:text-amber-300">
                      {t("monitor_center.in_flight.attempt", { attempt: request.attempt })}
                    </span>
                  ) : null}
                  {retried && details.length > 0 ? " · " : null}
                  {details.join(" · ")}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "key",
        header: t("monitor_center.in_flight.col_key"),
        width: 128,
        overflowTooltip: false,
        cell: (request) => (
          <span className="truncate text-sn-label2" title={request.api_key_id || undefined}>
            {request.api_key_name || request.api_key_id || "—"}
          </span>
        ),
      },
    ],
    [t],
  );
}
