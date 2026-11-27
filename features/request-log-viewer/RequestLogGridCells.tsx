import { VendorIcon } from "@code-proxy/assets";
import { maskSensitiveIdentity } from "@code-proxy/domain";
import {
  Avatar,
  GridCellTooltip,
  GridTooltipRows,
  StatusTag,
  formatClock,
  formatCompactNumber,
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatRelativeTime,
  formatUsd,
  isSameLocalDay,
} from "@code-proxy/ui";
import { CircleHelp, Globe, Package, SquareTerminal } from "@code-proxy/ui/icons";
import { useTranslation } from "react-i18next";
import { describeRequestLogClient } from "./requestLogClients";
import { loopStoppedExplanation } from "./requestLogGuard";
import { computeOutputTokensPerSecond, describeThroughput } from "./requestLogMetrics";
import type { RequestLogsRow } from "./requestLogsRow";

/**
 * 请求日志表格的单元格（计划 104 第 5 节，演示页定下的样式）：
 * - 主值一行、辅助信息一行（更小、更淡）；
 * - 数字靠右、等宽数字，格子里写短，精确值与拆分放悬停提示；
 * - 颜色只表达状态或阈值（慢、失败、命中率），不做装饰。
 */

const DASH = "—";

function Dash() {
  return <span className="text-sn-label-off">{DASH}</span>;
}

export function RequestLogTimeCell({ row, now }: { row: RequestLogsRow; now: number }) {
  const { t, i18n } = useTranslation();
  if (!Number.isFinite(row.timestampMs)) {
    return <span className="font-mono text-xs text-sn-label3">{row.timestamp || DASH}</span>;
  }
  const date = new Date(row.timestampMs);
  const relative = formatRelativeTime(row.timestampMs, now, i18n.language);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={formatDateTime(row.timestampMs)}
          rows={[
            [t("request_logs.request_id"), `#${row.id}`],
            [t("request_logs.time_ago"), relative],
          ]}
        />
      }
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-xs tabular-nums text-sn-label">
          {formatClock(row.timestampMs)}
        </span>
        <span className="mt-0.5 truncate text-2xs text-sn-label3">
          {isSameLocalDay(row.timestampMs, now)
            ? relative
            : `${date.getMonth() + 1}/${date.getDate()}`}
        </span>
      </span>
    </GridCellTooltip>
  );
}

/** 用户 / Key 列。variant="key" 只写 Key 名（API Key 自己的用量、公开查询）。 */
export function RequestLogIdentityCell({
  row,
  variant,
  masked,
}: {
  row: RequestLogsRow;
  variant: "user" | "key";
  masked: boolean;
}) {
  const { t } = useTranslation();
  if (row.isSystemCall) {
    return (
      <StatusTag size="sm" tone="neutral" dot={false}>
        {t("request_logs.system_call")}
      </StatusTag>
    );
  }
  const mask = (value: string) => (masked && value !== DASH ? maskSensitiveIdentity(value) : value);
  const keyFallback = row.maskedApiKey || (row.apiKeyId ? row.apiKeyId.slice(0, 8) : "");
  const keyName = mask(
    row.apiKeyOwnName || (!row.endUserDisplayName ? row.apiKeyName : "") || keyFallback || DASH,
  );
  const primary = variant === "key" ? keyName : mask(row.endUserDisplayName || row.apiKeyName || DASH);
  const secondary = variant === "user" && keyName !== primary ? keyName : "";
  const avatarSeed = masked ? "masked-user" : (primary === DASH ? "guest" : primary);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={primary}
          rows={[
            ...(variant === "user" ? [[t("request_logs.col_key_name"), keyName] as const] : []),
            ...(row.maskedApiKey ? [["Key", row.maskedApiKey] as const] : []),
          ]}
        />
      }
    >
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="inline-flex shrink-0">
          <Avatar name={avatarSeed} size={24} decorative />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className={`truncate text-sm font-medium ${primary === DASH ? "text-sn-label-off" : "text-sn-label"}`}>
            {primary}
          </span>
          {secondary ? (
            <span className="mt-0.5 truncate font-mono text-2xs text-sn-label3">{secondary}</span>
          ) : null}
        </span>
      </span>
    </GridCellTooltip>
  );
}

export function RequestLogChannelCell({ row, masked }: { row: RequestLogsRow; masked: boolean }) {
  const { t } = useTranslation();
  const name = masked ? maskSensitiveIdentity(row.channelName) : row.channelName;
  const auth =
    row.channelAuthType === "api"
      ? t("request_logs.auth_type_api")
      : row.channelAuthType === "oauth"
        ? t("request_logs.auth_type_oauth")
        : "";
  const provider = row.channelProvider ?? "";
  if (!name) return <Dash />;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={name}
          rows={[
            ...(auth ? [[t("request_logs.auth_method"), auth] as const] : []),
            ...(provider ? [[t("request_logs.provider"), provider] as const] : []),
          ]}
        />
      }
    >
      {/* 渠道名常是 OAuth 邮箱，独占第一行；认证方式和厂商用轻盈点隔副行展示，摒弃旧式灰框图标盒。 */}
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className="inline-flex shrink-0">
          <VendorIcon modelId={provider} size={16} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm text-sn-label">{name}</span>
          {auth || provider ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-sn-label3">
              {auth ? <span className="shrink-0">{auth}</span> : null}
              {auth && provider ? <span aria-hidden="true">·</span> : null}
              {provider ? <span className="min-w-0 truncate">{provider}</span> : null}
            </span>
          ) : null}
        </span>
      </span>
    </GridCellTooltip>
  );
}

const CLIENT_GLYPH = { terminal: SquareTerminal, browser: Globe, package: Package } as const;

/**
 * Agent 列：显示名 + 图标，第二行版本，悬停看原始 User-Agent。
 * 没有客户端名（旧数据、请求没带 UA）写「未知」；认不得的客户端原样显示它的 ID。
 */
export function RequestLogAgentCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  const client = describeRequestLogClient(row.clientName);
  const label = client ? (client.labelKey ? t(client.labelKey) : client.label) : t("request_logs.agent_unknown");
  const Glyph = client?.glyph ? CLIENT_GLYPH[client.glyph] : CircleHelp;
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      {client?.vendor ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          <VendorIcon modelId={client.vendor} size={16} />
        </span>
      ) : (
        <Glyph
          size={15}
          aria-hidden="true"
          className={`shrink-0 ${client ? "text-sn-label3" : "text-sn-label-off"}`}
        />
      )}
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate text-sm ${client ? "text-sn-label" : "text-sn-label-off"}`}>{label}</span>
        {row.clientVersion ? (
          <span className="mt-0.5 truncate font-mono text-2xs text-sn-label3">{row.clientVersion}</span>
        ) : null}
      </span>
    </span>
  );
  return (
    <GridCellTooltip
      content={
        <span className="block max-w-[22rem]">
          <span className="mb-1 block text-xs font-semibold">{t("request_logs.user_agent")}</span>
          {row.userAgent ? (
            <span className="block break-all font-mono text-2xs opacity-80">{row.userAgent}</span>
          ) : (
            <span className="block text-2xs opacity-70">{t("request_logs.user_agent_missing")}</span>
          )}
        </span>
      }
    >
      {content}
    </GridCellTooltip>
  );
}

/**
 * Token 一列（输入 → 输出 + 缓存命中），计划 104 第二阶段验收：原来输入、缓存命中、输出各占一列，
 * 1470 宽的笔记本上请求日志默认列放不下。合成一列后：
 * - 主行「输入 → 输出」，写短（86.1K → 3,314）；存了正文时两个数字都是按钮，点开看这次的输入或输出；
 * - 副行是缓存命中率（缓存读取 ÷ 整个提示，同后端 cache_hit_rate 的口径）和一条细进度条；
 * - 悬停看精确值：输入及其拆分（缓存读取、写入、未命中）、输出、总计、命中率。
 */
export function RequestLogTokensCell({
  row,
  onOpen,
}: {
  row: RequestLogsRow;
  onOpen?: (row: RequestLogsRow, side: "input" | "output") => void;
}) {
  const { t } = useTranslation();
  const input = row.inputTokens;
  const output = row.outputTokens;
  if (!Number.isFinite(input) && !Number.isFinite(output)) return <Dash />;
  const use = row.cacheUse;
  const prompt = row.promptTokens ?? input;
  const ratio =
    use.kind === "known" && prompt > 0 ? Math.max(0, Math.min(1, use.readTokens / prompt)) : null;
  const canOpen = row.hasContent && Boolean(onOpen);
  const number = (side: "input" | "output", value: number) => {
    const text = <span className="tabular-nums">{formatCompactNumber(value)}</span>;
    if (!canOpen) return text;
    const label = t(side === "input" ? "request_logs.view_input" : "request_logs.view_output");
    return (
      <button
        type="button"
        onClick={() => onOpen?.(row, side)}
        aria-label={`${label} · ${formatInteger(value)}`}
        className="-mx-1 rounded-md px-1 underline decoration-sn-label-off decoration-dotted underline-offset-[3px] transition-colors hover:bg-sn-hover hover:decoration-current"
      >
        {text}
      </button>
    );
  };
  const rows: (readonly [string, string])[] = [[t("request_logs.col_input"), formatInteger(input)]];
  if (use.kind === "known") {
    rows.push(
      [`· ${t("request_logs.cache_read_tokens")}`, formatInteger(use.readTokens)],
      [`· ${t("request_logs.col_cache_write")}`, formatInteger(use.writeTokens)],
      [`· ${t("request_logs.cache_miss")}`, formatInteger(Math.max(0, input - use.readTokens - use.writeTokens))],
    );
  } else if (use.kind === "legacy" && use.cachedTokens > 0) {
    rows.push([`· ${t("request_logs.cache_read_tokens")}`, formatInteger(use.cachedTokens)]);
  }
  rows.push([t("request_logs.col_output"), formatInteger(output)]);
  rows.push([t("request_logs.col_total_token"), formatInteger(row.totalTokens)]);
  if (ratio !== null) rows.push([t("request_logs.cache_hit_rate"), `${(ratio * 100).toFixed(1)}%`]);
  const unknownHint =
    use.kind === "unknown"
      ? use.legacyCachedTokens > 0
        ? t("request_logs.cache_unknown_legacy", { cached: formatInteger(use.legacyCachedTokens) })
        : t("request_logs.cache_unknown")
      : undefined;
  const footnote = [
    ratio !== null ? t("request_logs.cache_hit_formula") : (unknownHint ?? null),
    canOpen ? t("request_logs.tokens_open_hint") : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`${t("request_logs.col_tokens")} ${formatInteger(row.totalTokens)}`}
          rows={rows}
          footnote={footnote || undefined}
        />
      }
    >
      <span className="flex min-w-0 flex-col items-end gap-1">
        <span className="flex items-baseline gap-1 whitespace-nowrap text-sn-label">
          {number("input", input)}
          <span className="text-2xs text-sn-label-off" aria-hidden="true">
            →
          </span>
          {output > 0 ? number("output", output) : <span className="text-sn-label-off">{DASH}</span>}
        </span>
        <CacheMeter
          ratio={ratio}
          legacyCached={use.kind === "legacy" ? use.cachedTokens : 0}
          unknownHint={unknownHint}
        />
      </span>
    </GridCellTooltip>
  );
}

/**
 * 副行：「缓存」+ 细进度条 + 命中率。上游没报缓存用量写「—」（不写 0%，读屏读到原因）；
 * 旧后端只有一个 cached_tokens（读取，或没读时是写入），那不是命中率，写 token 数。
 */
function CacheMeter({
  ratio,
  legacyCached,
  unknownHint,
}: {
  ratio: number | null;
  legacyCached: number;
  unknownHint?: string;
}) {
  const { t } = useTranslation();
  const label = <span className="text-sn-label-off">{t("request_logs.cache_short")}</span>;
  if (ratio === null) {
    return (
      <span className="flex items-center gap-1.5 text-2xs leading-none">
        {label}
        {legacyCached > 0 ? (
          <span className="tabular-nums text-sn-label3">{formatCompactNumber(legacyCached)}</span>
        ) : (
          <span className="text-sn-label-off" aria-label={unknownHint}>
            {DASH}
          </span>
        )}
      </span>
    );
  }
  const tone =
    ratio >= 0.8
      ? "bg-sn-label/40 bar-semantic:bg-emerald-500"
      : ratio >= 0.4
        ? "bg-sn-label/30 bar-semantic:bg-amber-500"
        : "bg-sn-label/20 bar-semantic:bg-rose-400";
  return (
    <span className="flex items-center gap-1.5 text-2xs leading-none">
      {label}
      <span className="h-1 w-9 overflow-hidden rounded-full bg-sn-label/[0.07] dark:bg-white/[0.08]" aria-hidden="true">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </span>
      <span className="w-[5ch] text-right tabular-nums text-sn-label2">{Math.round(ratio * 100)}%</span>
    </span>
  );
}

/** 耗时着色：10 秒以上琥珀、30 秒以上红，其余正常墨色。 */
function durationTone(ms: number): string {
  if (ms >= 30_000) return "text-rose-600 dark:text-rose-400";
  if (ms >= 10_000) return "text-amber-600 dark:text-amber-400";
  return "text-sn-label";
}

/** 两行：总耗时（按阈值着色）+ 首字。一眼分得清慢在等首字还是慢在生成；流式与否写在提示里。 */
export function RequestLogLatencyCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  const latency = row.latencyMs ?? Number.NaN;
  if (!Number.isFinite(latency) || latency < 0) return <Dash />;
  const firstToken = row.firstTokenMs ?? 0;
  const mode = t(row.streaming ? "request_logs.mode_streaming" : "request_logs.mode_non_streaming");
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`${t("request_logs.col_duration")} ${formatDurationMs(latency)}`}
          rows={[
            [
              t("request_logs.col_first_token"),
              firstToken > 0 ? formatDurationMs(firstToken) : t("request_logs.not_recorded"),
            ],
            ...(firstToken > 0
              ? [[t("request_logs.generation_time"), formatDurationMs(Math.max(0, latency - firstToken))] as const]
              : []),
            [t("request_logs.col_mode"), mode],
          ]}
        />
      }
    >
      <span className="flex min-w-0 flex-col items-end leading-tight">
        <span className={`tabular-nums ${durationTone(latency)}`}>{formatDurationMs(latency)}</span>
        <span className="mt-0.5 whitespace-nowrap text-2xs text-sn-label3">
          {row.streaming ? (
            <>
              {t("request_logs.first_token_short")}{" "}
              <span className={`tabular-nums ${firstToken >= 10_000 ? durationTone(firstToken) : ""}`}>
                {firstToken > 0 ? formatDurationMs(firstToken) : DASH}
              </span>
            </>
          ) : (
            mode
          )}
        </span>
      </span>
    </GridCellTooltip>
  );
}

/** tok/s 的写法：一百以上取整，十以上一位小数，再小两位小数。 */
export function formatTokensPerSecondValue(value: number): string {
  if (value >= 100) return formatInteger(value);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/** 吞吐列：输出 token ÷ 生成时间，提示里把算式摊开，读的人能自己验算。 */
export function RequestLogThroughputCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  const tps = computeOutputTokensPerSecond(row);
  const basis = describeThroughput(row);
  if (tps === null || !basis) return <Dash />;
  const value = formatTokensPerSecondValue(tps);
  const seconds = basis.ms / 1000;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`${t("request_logs.col_throughput")} ${value} tok/s`}
          rows={[
            [
              t("request_logs.formula"),
              `${formatInteger(row.outputTokens)} token ÷ ${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`,
            ],
            [t("request_logs.col_duration"), formatDurationMs(row.latencyMs ?? 0)],
            [
              t("request_logs.col_first_token"),
              (row.firstTokenMs ?? 0) > 0 ? formatDurationMs(row.firstTokenMs ?? 0) : t("request_logs.not_recorded"),
            ],
          ]}
          footnote={t(`request_logs.throughput_basis_${basis.basis}`)}
        />
      }
    >
      <span className="whitespace-nowrap tabular-nums text-sn-label">
        {value}
        <span className="ml-0.5 text-2xs text-sn-label3">tok/s</span>
      </span>
    </GridCellTooltip>
  );
}

export function RequestLogCostCell({ row }: { row: RequestLogsRow }) {
  const { t } = useTranslation();
  if (!(row.cost > 0)) return <Dash />;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`${t("request_logs.col_cost")} $${row.cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`}
          rows={[[t("request_logs.col_total_token"), formatInteger(row.totalTokens)]]}
          footnote={t("request_logs.cost_estimated")}
        />
      }
    >
      <span className="tabular-nums text-sn-label">{formatUsd(row.cost)}</span>
    </GridCellTooltip>
  );
}

/**
 * 状态：成功是常态，绿点加中性文字；失败是红色胶囊，点开看错误；循环保护拦截的用琥珀色——
 * 那是我们故意停的，不是上游或模型出错。标签保持一个词，完整的解释在悬停提示里。
 */
export function RequestLogStatusCell({
  row,
  onOpenError,
}: {
  row: RequestLogsRow;
  onOpenError?: (row: RequestLogsRow) => void;
}) {
  const { t } = useTranslation();
  if (!row.failed) {
    return (
      <StatusTag size="sm" tone="ok">
        {t("request_logs.status_success")}
      </StatusTag>
    );
  }
  const loop = Boolean(row.guardKind);
  const label = t(loop ? "request_logs.status_loop_stopped" : "request_logs.status_failed");
  const hint = loop ? loopStoppedExplanation(t, row.guardKind) : t("request_logs.view_error");
  const tagClassName = [
    "sn-tag sn-sm",
    loop ? "sn-warn" : "sn-bad",
    onOpenError ? "cursor-pointer transition-opacity hover:opacity-80" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <GridCellTooltip content={<span className="block max-w-[18rem] text-xs">{hint}</span>}>
      {onOpenError ? (
        <button type="button" onClick={() => onOpenError(row)} className={tagClassName}>
          <i aria-hidden="true" />
          {label}
        </button>
      ) : (
        <StatusTag size="sm" tone={loop ? "warn" : "bad"}>
          {label}
        </StatusTag>
      )}
    </GridCellTooltip>
  );
}
