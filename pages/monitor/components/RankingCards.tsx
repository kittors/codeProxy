import { useTranslation } from "react-i18next";
import { Boxes, KeyRound, Network, UserRound, Users } from "lucide-react";
import type { MonitorBreakdownRow, MonitorOverview } from "@code-proxy/api-client";
import { VendorIcon } from "@code-proxy/assets";
import { Card, chartUsesIdentityColors, iconHueClass } from "@code-proxy/ui";
import { ChannelIdentityLabel } from "@features/request-log-viewer";
import { LevelDot } from "@features/monitor-widgets/monitorVisuals";
import {
  formatMonitorCompact,
  formatMonitorCost,
  formatMonitorDuration,
  formatMonitorPercent,
} from "../model/monitorFormat";
import { MONITOR_CHANNEL_MIN_REQUESTS } from "../model/monitorHealth";
import type { MonitorFilterDimension } from "../model/monitorQueryState";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";
import { MonitorRankingTable, ShareBar, type RankingColumn } from "./MonitorRankingTable";
import { MonitorSparkline } from "./MonitorSparkline";
import { metricColor, successLevel, successTextClass } from "./monitorTheme";

interface RankingCardProps {
  overview: MonitorOverview;
  legacy: boolean;
  loading: boolean;
  isDark: boolean;
  selected: readonly string[];
  onSelect: (dimension: MonitorFilterDimension, value: string) => void;
}

const dash = <span className="text-ink-4">—</span>;

/**
 * 窄屏按重要性收起次要列，而不是让表格横向滚出卡片：成功率、请求、耗时最后才收。
 * 类名必须是完整的静态字符串，Tailwind 才能扫描到。
 */
const withClass = (column: RankingColumn, extra: string): RankingColumn => ({
  ...column,
  className: [column.className, extra].filter(Boolean).join(" "),
});

const shareOf = (row: MonitorBreakdownRow, overview: MonitorOverview) =>
  overview.summary.current.requests > 0
    ? (row.requests / overview.summary.current.requests) * 100
    : 0;

/** 两列布局里的渠道 / 门户用户表用紧凑列宽，把空间留给名称列。 */
function useCommonColumns(overview: MonitorOverview, legacy: boolean, compact = false) {
  const { t } = useTranslation();
  const width = compact ? "w-20" : "w-24";
  const requests: RankingColumn = {
    key: "requests",
    header: t("monitor_center.ranking.requests"),
    align: "right",
    className: width,
    render: (row) => (
      <span className="flex flex-col items-end leading-tight">
        <span className="font-medium text-ink">{formatMonitorCompact(row.requests)}</span>
        <span className="text-2xs text-ink-3">
          {formatMonitorPercent(shareOf(row, overview), 1)}
        </span>
      </span>
    ),
  };
  const success: RankingColumn = {
    key: "success",
    header: t("monitor_center.ranking.success_rate"),
    align: "right",
    className: width,
    render: (row) =>
      legacy ? (
        dash
      ) : (
        <span
          className={`font-medium ${successTextClass(row.success_rate, row.requests)}`}
          title={t("monitor_center.ranking.failed_count", { count: row.failed })}
        >
          {formatMonitorPercent(row.success_rate, row.success_rate >= 99.995 ? 0 : 2)}
        </span>
      ),
  };
  const latency: RankingColumn = {
    key: "latency",
    header: t("monitor_center.ranking.latency_avg"),
    align: "right",
    className: width,
    render: (row) =>
      row.latency_avg_ms > 0 ? (
        <span className="text-ink-2">{formatMonitorDuration(row.latency_avg_ms)}</span>
      ) : (
        dash
      ),
  };
  const tokens: RankingColumn = {
    key: "tokens",
    header: t("monitor_center.ranking.tokens"),
    align: "right",
    className: width,
    render: (row) => <span className="text-ink-2">{formatMonitorCompact(row.total_tokens)}</span>,
  };
  const cost: RankingColumn = {
    key: "cost",
    header: t("monitor_center.ranking.cost"),
    align: "right",
    className: width,
    render: (row) =>
      legacy ? dash : <span className="text-ink-2">{formatMonitorCost(row.cost)}</span>,
  };
  return { requests, success, latency, tokens, cost };
}

function trendColumn(header: string, color: string, compact = false): RankingColumn {
  return {
    key: "trend",
    header,
    align: "right",
    className: compact ? "w-24" : "w-28",
    render: (row) =>
      row.trend.length > 0 ? (
        <MonitorSparkline
          values={row.trend}
          failed={row.trend_failed}
          color={color}
          className={`ml-auto h-7 ${compact ? "w-20" : "w-24"}`}
        />
      ) : (
        dash
      ),
  };
}

/** 模型性能榜：哪个模型用得多、哪个慢、哪个贵、哪个在出错。 */
export function ModelLeaderboardCard({
  overview,
  legacy,
  loading,
  isDark,
  selected,
  onSelect,
}: RankingCardProps) {
  const { t } = useTranslation();
  const columns = useCommonColumns(overview, legacy);
  const requestsColor = metricColor("requests", isDark);
  const rows = overview.models.rows;

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={Boxes}
          label={t("monitor_center.models.title")}
          note={t("monitor_center.ranking.count_models", { count: overview.models.total })}
        />
      }
      loading={loading}
    >
      {rows.length === 0 ? (
        <MonitorInlineNotice
          icon={Boxes}
          title={t("monitor_center.empty.title")}
          className="py-8"
        />
      ) : (
        <MonitorRankingTable
          rows={rows}
          total={overview.models.total}
          selected={selected}
          onSelect={legacy ? undefined : (key) => onSelect("models", key)}
          minWidth="min-w-0"
          primary={(row) => (
            <span className="block min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center" aria-hidden="true">
                  <VendorIcon modelId={row.label} size={16} />
                </span>
                <span className="truncate font-medium text-ink">{row.label}</span>
              </span>
              <ShareBar share={shareOf(row, overview)} color={requestsColor} />
            </span>
          )}
          columns={[
            {
              key: "model",
              header: t("monitor_center.models.model"),
              className: "min-w-40 xl:min-w-56",
              render: () => null,
            },
            columns.requests,
            columns.success,
            withClass(columns.latency, "hidden sm:table-cell"),
            {
              key: "first_token",
              header: t("monitor_center.ranking.first_token"),
              align: "right",
              className: "hidden w-24 xl:table-cell",
              render: (row) =>
                row.first_token_avg_ms > 0 ? (
                  <span className="text-ink-2">
                    {formatMonitorDuration(row.first_token_avg_ms)}
                  </span>
                ) : (
                  dash
                ),
            },
            {
              key: "speed",
              header: t("monitor_center.ranking.speed"),
              align: "right",
              className: "hidden w-24 xl:table-cell",
              render: (row) =>
                row.output_tokens_per_second > 0 ? (
                  <span className="text-ink-2">
                    {t("monitor_center.ranking.speed_value", {
                      value: formatMonitorCompact(Math.round(row.output_tokens_per_second)),
                    })}
                  </span>
                ) : (
                  dash
                ),
            },
            withClass(columns.tokens, "hidden lg:table-cell"),
            withClass(columns.cost, "hidden md:table-cell"),
            withClass(
              trendColumn(t("monitor_center.ranking.trend"), requestsColor),
              "hidden md:table-cell",
            ),
          ]}
        />
      )}
    </Card>
  );
}

/** 渠道健康：每个渠道（AI 账号 / 供应商）的成功率与耗时，坏渠道一眼可见。 */
export function ChannelHealthCard({
  overview,
  legacy,
  loading,
  isDark,
  selected,
  onSelect,
}: RankingCardProps) {
  const { t } = useTranslation();
  const columns = useCommonColumns(overview, legacy, true);
  const rows = overview.channels.rows;

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={Network}
          label={t("monitor_center.channels.title")}
          note={
            legacy
              ? undefined
              : t("monitor_center.ranking.count_channels", { count: overview.channels.total })
          }
        />
      }
      loading={loading}
      className="h-full"
    >
      {legacy ? (
        <MonitorInlineNotice
          icon={Network}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.channels.upgrade_hint")}
        />
      ) : rows.length === 0 ? (
        <MonitorInlineNotice
          icon={Network}
          title={t("monitor_center.empty.title")}
          className="py-8"
        />
      ) : (
        <MonitorRankingTable
          rows={rows}
          total={overview.channels.total}
          selected={selected}
          onSelect={(key) => onSelect("channels", key)}
          initialLimit={8}
          minWidth="min-w-0"
          primary={(row) => {
            const level = successLevel(row.success_rate);
            const idle = row.requests < MONITOR_CHANNEL_MIN_REQUESTS;
            return (
              <span className="flex min-w-0 items-center gap-2.5">
                {/* 空闲点与 LevelDot 一样：多彩风格加一圈淡光晕，简约风格只有实心点。 */}
                {idle ? (
                  <span
                    className="size-2 shrink-0 rounded-full bg-ink-4 colorful:ring-4 colorful:ring-ink-4/15"
                    role="img"
                    aria-label={t("monitor_center.channels.status_idle")}
                    title={t("monitor_center.channels.status_idle")}
                  />
                ) : (
                  <LevelDot level={level} label={t(`monitor_center.channels.status_${level}`)} />
                )}
                <ChannelIdentityLabel
                  name={row.label || t("monitor_center.unknown_channel")}
                  provider={row.provider}
                  authType={row.auth_type}
                  apiLabel={t("request_logs.auth_type_api")}
                  oauthLabel={t("request_logs.auth_type_oauth")}
                  nameClassName="text-sm font-medium text-ink"
                />
              </span>
            );
          }}
          columns={[
            {
              key: "channel",
              header: t("monitor_center.channels.channel"),
              className: "min-w-40 sm:min-w-48",
              render: () => null,
            },
            columns.requests,
            columns.success,
            withClass(columns.latency, "hidden sm:table-cell"),
            withClass(
              trendColumn(t("monitor_center.ranking.trend"), metricColor("requests", isDark), true),
              "hidden sm:table-cell",
            ),
          ]}
        />
      )}
    </Card>
  );
}

/** 门户用户排行：谁在用、用了多少、花了多少。按门户用户合并名下所有 API Key。 */
export function ConsumerLeaderboardCard({
  overview,
  legacy,
  loading,
  isDark,
  selected,
  onSelect,
}: RankingCardProps) {
  const { t } = useTranslation();
  const columns = useCommonColumns(overview, legacy, true);
  const rows = overview.consumers.rows;
  // 占比细条：多彩图表沿用 Token 紫（这张表的身份色），强调色图表和模型榜一样用请求色（即强调色）。
  const shareColor = metricColor(chartUsesIdentityColors() ? "tokens" : "requests", isDark);

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={Users}
          label={t("monitor_center.consumers.title")}
          note={t("monitor_center.ranking.count_consumers", { count: overview.consumers.total })}
        />
      }
      loading={loading}
      className="h-full"
    >
      {rows.length === 0 ? (
        <MonitorInlineNotice
          icon={Users}
          title={t("monitor_center.empty.title")}
          className="py-8"
        />
      ) : (
        <MonitorRankingTable
          rows={rows}
          total={overview.consumers.total}
          selected={selected}
          onSelect={legacy ? undefined : (key) => onSelect("consumers", key)}
          initialLimit={8}
          minWidth="min-w-0"
          primary={(row) => {
            const Icon = row.kind === "end_user" ? UserRound : KeyRound;
            return (
              <span className="block min-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon size={14} className={`shrink-0 text-ink-3 ${iconHueClass(Icon)}`} aria-hidden="true" />
                  <span className="truncate font-medium text-ink">
                    {row.label || t("monitor_center.unnamed_consumer")}
                  </span>
                  {row.key_hint ? (
                    <span className="shrink-0 font-mono text-2xs text-ink-3">{row.key_hint}</span>
                  ) : null}
                </span>
                <ShareBar share={shareOf(row, overview)} color={shareColor} />
              </span>
            );
          }}
          columns={[
            {
              key: "consumer",
              header: t("monitor_center.consumers.consumer"),
              className: "min-w-36 sm:min-w-44",
              render: () => null,
            },
            columns.requests,
            withClass(columns.success, "hidden sm:table-cell"),
            withClass(columns.tokens, "hidden md:table-cell"),
            columns.cost,
          ]}
        />
      )}
    </Card>
  );
}
