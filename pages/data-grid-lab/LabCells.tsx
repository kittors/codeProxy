import { VendorIcon } from "@code-proxy/assets";
import {
  GridCellTooltip,
  GridTooltipRows,
  HUE_SOFT_BASE,
  HUE_TILE,
  formatClock,
  formatCompactNumber,
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  formatUsd,
  isSameLocalDay,
} from "@code-proxy/ui";
import { labCacheRatio, labThroughput, maskLabKey, type LabLogRow } from "./labData";

/**
 * 演示页的单元格。规则（计划 104 第 5 节）：
 * - 主值一行、辅助信息一行（更小、更淡），两行之间不放分隔；
 * - 数字靠右、等宽数字，短写法在格子里，精确值与拆分放 tooltip；
 * - 颜色只表达状态或阈值（慢、失败、命中率），不做装饰。
 * 演示页只在开发环境注册，文案直接写中文；迁到正式页面时换成 request_logs.* 的 i18n 键。
 */

const AUTH_LABEL: Record<LabLogRow["channel"]["auth"], string> = { oauth: "OAuth", api: "API" };

export function TimeCell({ row, now }: { row: LabLogRow; now: number }) {
  const today = isSameLocalDay(row.timestampMs, now);
  const date = new Date(row.timestampMs);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={formatDateTime(row.timestampMs)}
          rows={[
            ["请求 ID", `#${row.id}`],
            ["距现在", formatRelativeTime(row.timestampMs, now, "zh-CN")],
          ]}
        />
      }
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="font-mono text-xs tabular-nums text-ink">
          {formatClock(row.timestampMs)}
        </span>
        <span className="mt-0.5 truncate text-2xs text-ink-3">
          {today
            ? formatRelativeTime(row.timestampMs, now, "zh-CN")
            : `${date.getMonth() + 1}/${date.getDate()}`}
        </span>
      </span>
    </GridCellTooltip>
  );
}

export function UserCell({ row }: { row: LabLogRow }) {
  const initial = Array.from(row.user.name)[0]?.toUpperCase() ?? "?";
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={row.user.name}
          rows={[["Key", maskLabKey(row.user.key)]]}
          footnote="客户端（User-Agent）和来源 IP 在展开详情里"
        />
      }
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${HUE_SOFT_BASE} ${HUE_TILE[row.user.hue]}`}
        >
          {initial}
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-ink">{row.user.name}</span>
          <span className="mt-0.5 truncate font-mono text-2xs text-ink-3">
            {maskLabKey(row.user.key)}
          </span>
        </span>
      </span>
    </GridCellTooltip>
  );
}

const THINKING_LABEL: Record<Exclude<LabLogRow["thinking"], "">, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function ModelCell({ row }: { row: LabLogRow }) {
  const mapped = row.upstreamModel !== row.model;
  const fallback = row.upstreamModel.endsWith("-fallback");
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={row.model}
          rows={[
            ["上游实际模型", row.upstreamModel],
            ["推理强度", row.thinking ? THINKING_LABEL[row.thinking] : "未指定"],
            ["调用方式", row.streaming ? "流式" : "非流式"],
          ]}
          footnote={fallback ? "主模型繁忙，本次由降级模型应答" : undefined}
        />
      }
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.04] dark:bg-white/[0.06]">
          <VendorIcon modelId={row.model} size={15} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{row.model}</span>
            {row.thinking ? (
              <span className="shrink-0 rounded-md bg-ink/[0.05] px-1.5 text-2xs leading-4 text-ink-2 dark:bg-white/[0.07]">
                {row.thinking}
              </span>
            ) : null}
          </span>
          <span
            className={`mt-0.5 truncate text-2xs ${fallback ? "text-amber-600 dark:text-amber-400" : "text-ink-3"}`}
          >
            {mapped ? `→ ${row.upstreamModel}` : row.streaming ? "流式" : "非流式"}
          </span>
        </span>
      </span>
    </GridCellTooltip>
  );
}

const PROVIDER_LABEL: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  antigravity: "Antigravity",
  vertex: "Vertex",
  openai: "OpenAI 兼容",
};

export function ChannelCell({ row }: { row: LabLogRow }) {
  const provider = PROVIDER_LABEL[row.channel.provider] ?? row.channel.provider;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={row.channel.name}
          rows={[
            ["认证方式", AUTH_LABEL[row.channel.auth]],
            ["上游厂商", provider],
          ]}
        />
      }
    >
      {/* 渠道名常是 OAuth 邮箱，独占第一行；认证方式和厂商放第二行，不和名字抢宽度。 */}
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ink/[0.04] dark:bg-white/[0.06]">
          <VendorIcon modelId={row.channel.provider} size={14} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm text-ink">{row.channel.name}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-2xs text-ink-3">
            <span
              className={
                row.channel.auth === "oauth"
                  ? "font-medium text-ink-2 colorful:text-sky-600 colorful:dark:text-sky-400"
                  : "font-medium text-ink-2"
              }
            >
              {AUTH_LABEL[row.channel.auth]}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{provider}</span>
          </span>
        </span>
      </span>
    </GridCellTooltip>
  );
}

export function InputTokensCell({ row }: { row: LabLogRow }) {
  const uncached = Math.max(0, row.inputTokens - row.cacheReadTokens - row.cacheWriteTokens);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`输入 ${formatInteger(row.inputTokens)} tokens`}
          rows={[
            ["缓存读取", formatInteger(row.cacheReadTokens)],
            ["缓存写入", formatInteger(row.cacheWriteTokens)],
            ["未命中", formatInteger(uncached)],
          ]}
        />
      }
    >
      <span className="tabular-nums text-ink">{formatCompactNumber(row.inputTokens)}</span>
    </GridCellTooltip>
  );
}

export function OutputTokensCell({ row }: { row: LabLogRow }) {
  if (row.outputTokens <= 0) return <span className="text-ink-4">—</span>;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`输出 ${formatInteger(row.outputTokens)} tokens`}
          rows={[
            ["其中推理", formatInteger(row.reasoningTokens)],
            ["正文", formatInteger(row.outputTokens - row.reasoningTokens)],
          ]}
        />
      }
    >
      <span className="tabular-nums text-ink">{formatCompactNumber(row.outputTokens)}</span>
    </GridCellTooltip>
  );
}

export function CacheCell({ row }: { row: LabLogRow }) {
  const ratio = labCacheRatio(row);
  const tone =
    ratio >= 0.8
      ? "bg-ink/40 bar-semantic:bg-emerald-500"
      : ratio >= 0.4
        ? "bg-ink/30 bar-semantic:bg-amber-500"
        : "bg-ink/20 bar-semantic:bg-rose-400";
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`缓存命中 ${formatPercent(ratio)}`}
          rows={[
            ["命中（读取）", formatInteger(row.cacheReadTokens)],
            ["新写入", formatInteger(row.cacheWriteTokens)],
            ["输入合计", formatInteger(row.inputTokens)],
          ]}
          footnote="命中率 = 缓存读取 ÷ 输入合计"
        />
      }
    >
      <span className="flex min-w-0 flex-col items-end gap-1">
        <span className="tabular-nums text-ink">{formatPercent(ratio)}</span>
        <span
          className="h-1 w-12 overflow-hidden rounded-full bg-ink/[0.07] dark:bg-white/[0.08]"
          aria-hidden="true"
        >
          <span
            className={`block h-full rounded-full ${tone}`}
            style={{ width: `${Math.max(2, ratio * 100)}%` }}
          />
        </span>
      </span>
    </GridCellTooltip>
  );
}

/** 耗时着色：10 秒以上琥珀、30 秒以上红，其余正常墨色。 */
function durationTone(ms: number): string {
  if (ms >= 30_000) return "text-rose-600 dark:text-rose-400";
  if (ms >= 10_000) return "text-amber-600 dark:text-amber-400";
  return "text-ink";
}

export function FirstTokenCell({ row }: { row: LabLogRow }) {
  if (row.firstTokenMs <= 0) return <span className="text-ink-4">—</span>;
  return (
    <span className={`tabular-nums ${durationTone(row.firstTokenMs)}`}>
      {formatDurationMs(row.firstTokenMs)}
    </span>
  );
}

export function LatencyCell({ row }: { row: LabLogRow }) {
  const generation = Math.max(0, row.latencyMs - row.firstTokenMs);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`总耗时 ${formatDurationMs(row.latencyMs)}`}
          rows={[
            ["首字", formatDurationMs(row.firstTokenMs)],
            ["生成", formatDurationMs(generation)],
            ["重试", row.retries > 0 ? `${row.retries} 次` : "无"],
          ]}
        />
      }
    >
      {/* 两行：总耗时（按阈值着色）+ 首字。扫一眼就分得清是慢在等首字，还是慢在生成。 */}
      <span className="flex min-w-0 flex-col items-end leading-tight">
        <span className={`tabular-nums ${durationTone(row.latencyMs)}`}>
          {formatDurationMs(row.latencyMs)}
        </span>
        <span className="mt-0.5 whitespace-nowrap text-2xs text-ink-3">
          首字{" "}
          <span
            className={`tabular-nums ${row.firstTokenMs >= 10_000 ? durationTone(row.firstTokenMs) : ""}`}
          >
            {row.firstTokenMs > 0 ? formatDurationMs(row.firstTokenMs) : "—"}
          </span>
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

const formatSeconds = (ms: number) => {
  const seconds = ms / 1000;
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
};

const THROUGHPUT_BASIS: Record<"generation" | "total" | "burst", string> = {
  generation: "生成时间 = 总耗时 − 首字",
  total: "非流式或没有首字时间，按总耗时算",
  burst: "首字后几乎立刻结束（缓冲后一次性写出），按总耗时算",
};

/**
 * 吞吐列：输出 token ÷ 生成时间。tooltip 把算式摊开写，读的人能自己验算；
 * 没有输出或时间为 0 显示「—」。
 */
export function ThroughputCell({ row }: { row: LabLogRow }) {
  const throughput = labThroughput(row);
  if (!throughput) return <span className="text-ink-4">—</span>;
  const value = formatTokensPerSecondValue(throughput.tokensPerSecond);
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`吞吐 ${value} tok/s`}
          rows={[
            [
              "算式",
              `${formatInteger(throughput.outputTokens)} token ÷ ${formatSeconds(throughput.ms)} = ${value} tok/s`,
            ],
            ["总耗时", formatDurationMs(row.latencyMs)],
            ["首字", row.firstTokenMs > 0 ? formatDurationMs(row.firstTokenMs) : "未记录"],
          ]}
          footnote={THROUGHPUT_BASIS[throughput.basis]}
        />
      }
    >
      <span className="whitespace-nowrap tabular-nums text-ink">
        {value}
        <span className="ml-0.5 text-2xs text-ink-3">tok/s</span>
      </span>
    </GridCellTooltip>
  );
}

export function CostCell({ row }: { row: LabLogRow }) {
  if (row.cost.total <= 0) return <span className="text-ink-4">—</span>;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={`费用 ${formatUsd(row.cost.total)}`}
          rows={[
            ["输入", formatUsd(row.cost.input)],
            ["输出", formatUsd(row.cost.output)],
            ["缓存", formatUsd(row.cost.cache)],
          ]}
          footnote="按模型目录价格估算"
        />
      }
    >
      <span className="tabular-nums text-ink">{formatUsd(row.cost.total)}</span>
    </GridCellTooltip>
  );
}

export const STATUS_LABEL: Record<LabLogRow["status"], string> = {
  success: "成功",
  failed: "失败",
  retried: "重试后成功",
  cancelled: "已取消",
};

export function StatusCell({ row, onOpenError }: { row: LabLogRow; onOpenError: () => void }) {
  if (row.status === "failed") {
    return (
      <GridCellTooltip
        content={
          <GridTooltipRows
            title={`HTTP ${row.httpStatus}`}
            rows={[
              [
                "错误",
                row.errorMessage.length > 48
                  ? `${row.errorMessage.slice(0, 48)}…`
                  : row.errorMessage,
              ],
            ]}
            footnote="点击展开完整错误"
          />
        }
      >
        <button
          type="button"
          onClick={onOpenError}
          className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-500/10 px-2.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-500/15 dark:bg-rose-400/15 dark:text-rose-300 dark:hover:bg-rose-400/25"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden="true" />
          {STATUS_LABEL.failed}
        </button>
      </GridCellTooltip>
    );
  }
  const dot =
    row.status === "success"
      ? "bg-emerald-500"
      : row.status === "retried"
        ? "bg-amber-500"
        : "bg-ink-4";
  const label = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {STATUS_LABEL[row.status]}
    </span>
  );
  if (row.status === "success") return label;
  return (
    <GridCellTooltip
      content={
        <GridTooltipRows
          title={STATUS_LABEL[row.status]}
          rows={
            row.status === "retried"
              ? [
                  ["重试次数", `${row.retries} 次`],
                  ["最终状态", `HTTP ${row.httpStatus}`],
                ]
              : [["状态码", `HTTP ${row.httpStatus}（客户端断开）`]]
          }
        />
      }
    >
      {label}
    </GridCellTooltip>
  );
}
