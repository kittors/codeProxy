import { VendorIcon } from "@code-proxy/assets";
import {
  formatDateTime,
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatUsd,
} from "@code-proxy/ui";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, Copy } from "@code-proxy/ui/icons";
import { useEffect, useState, type ReactNode } from "react";
import { STATUS_LABEL } from "./LabCells";
import { labCacheRatio, maskLabKey, type LabLogRow } from "./labData";

/**
 * 行展开后的详情：请求、路由、耗时与用量三栏，失败时最上面一条错误说明。
 * 单元格 tooltip 里的明细这里都有一份完整的，键盘和读屏用户不需要悬停也能读到。
 */

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).catch(() => undefined);
        setCopied(true);
      }}
      aria-label={copied ? `已复制${label}` : `复制${label}`}
      className="group/copy inline-flex min-w-0 items-center gap-1.5 rounded-md font-mono text-xs text-ink transition-colors hover:text-ink-2"
    >
      <span className="truncate">{value}</span>
      <span className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-ink-3">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={copied ? "done" : "copy"}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.16 }}
            className={copied ? "text-emerald-600 dark:text-emerald-400" : ""}
          >
            {copied ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </button>
  );
}

/** 标签固定宽度、值左对齐：详情栏很宽时，两端对齐会把标签和数值拉开半个屏幕，读起来要来回扫。 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-1">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="flex min-w-0 text-xs text-ink">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="mb-1.5 text-2xs font-semibold tracking-wide text-ink-3">{title}</h4>
      <dl className="flex flex-col">{children}</dl>
    </section>
  );
}

/** 一条分段比例条，下面一行标注每段的名称与数值。 */
function SegmentBar({
  segments,
}: {
  segments: readonly { label: string; value: number; display: string; className: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  return (
    <div className="mt-1">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-ink/[0.06] dark:bg-white/[0.08]">
        {segments.map((segment) => (
          <motion.span
            key={segment.label}
            initial={{ width: 0 }}
            animate={{ width: `${(segment.value / total) * 100}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className={`h-full ${segment.className}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-3">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${segment.className}`} aria-hidden="true" />
            {segment.label}
            <span className="tabular-nums text-ink-2">{segment.display}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LabDetailPanel({ row }: { row: LabLogRow }) {
  const generation = Math.max(0, row.latencyMs - row.firstTokenMs);
  const uncached = Math.max(0, row.inputTokens - row.cacheReadTokens - row.cacheWriteTokens);
  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-3">
      {row.status === "failed" ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-rose-500/[0.07] px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-semibold">HTTP {row.httpStatus}</span>
            <span className="mx-1.5 opacity-50">·</span>
            <span className="break-words font-mono">{row.errorMessage}</span>
          </span>
        </div>
      ) : null}
      <div className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.25fr]">
        <Section title="请求">
          <Field label="请求 ID">
            <CopyValue value={`#${row.id}`} label="请求 ID" />
          </Field>
          <Field label="时间">
            <span className="font-mono tabular-nums">{formatDateTime(row.timestampMs)}</span>
          </Field>
          <Field label="用户">{row.user.name}</Field>
          <Field label="Key">
            <span className="font-mono">{maskLabKey(row.user.key)}</span>
          </Field>
          <Field label="User-Agent">
            <span className="truncate font-mono" title={row.userAgent}>
              {row.userAgent}
            </span>
          </Field>
          <Field label="来源 IP">
            <span className="font-mono">{row.ip}</span>
          </Field>
        </Section>

        <Section title="路由">
          <Field label="模型映射">
            <span className="flex min-w-0 items-center gap-1.5">
              <VendorIcon modelId={row.model} size={13} />
              <span className="truncate">{row.model}</span>
              <ArrowRight size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="truncate text-ink-2">{row.upstreamModel}</span>
            </span>
          </Field>
          <Field label="渠道">
            <span className="truncate">{row.channel.name}</span>
          </Field>
          <Field label="推理强度">{row.thinking || "未指定"}</Field>
          <Field label="调用方式">{row.streaming ? "流式" : "非流式"}</Field>
          <Field label="状态">
            {row.status === "retried" ? `重试 ${row.retries} 次后成功` : STATUS_LABEL[row.status]}
          </Field>
        </Section>

        <Section title="耗时与用量">
          <Field label="总耗时">
            <span className="tabular-nums">{formatDurationMs(row.latencyMs)}</span>
          </Field>
          <SegmentBar
            segments={[
              {
                label: "首字",
                value: row.firstTokenMs,
                display: row.firstTokenMs > 0 ? formatDurationMs(row.firstTokenMs) : "—",
                className: "bg-ink/30 dark:bg-white/35",
              },
              {
                label: "生成",
                value: generation,
                display: formatDurationMs(generation),
                className: "bg-ink/70 dark:bg-white/70",
              },
            ]}
          />
          <div className="mt-3">
            <Field label="输入 tokens">
              <span className="tabular-nums">
                {formatInteger(row.inputTokens)}
                <span className="ml-1.5 text-ink-3">命中 {formatPercent(labCacheRatio(row))}</span>
              </span>
            </Field>
            <SegmentBar
              segments={[
                {
                  label: "缓存读取",
                  value: row.cacheReadTokens,
                  display: formatInteger(row.cacheReadTokens),
                  className:
                    "bg-ink/60 dark:bg-white/60 bar-semantic:bg-emerald-500 bar-semantic:dark:bg-emerald-400",
                },
                {
                  label: "缓存写入",
                  value: row.cacheWriteTokens,
                  display: formatInteger(row.cacheWriteTokens),
                  className:
                    "bg-ink/35 dark:bg-white/35 bar-semantic:bg-sky-500 bar-semantic:dark:bg-sky-400",
                },
                {
                  label: "未命中",
                  value: uncached,
                  display: formatInteger(uncached),
                  className:
                    "bg-ink/15 dark:bg-white/15 bar-semantic:bg-amber-400 bar-semantic:dark:bg-amber-300",
                },
              ]}
            />
          </div>
          <div className="mt-3">
            <Field label="费用">
              <span className="tabular-nums">
                {formatUsd(row.cost.total)}
                <span className="ml-1.5 text-ink-3">
                  输入 {formatUsd(row.cost.input)} · 输出 {formatUsd(row.cost.output)} · 缓存{" "}
                  {formatUsd(row.cost.cache)}
                </span>
              </span>
            </Field>
          </div>
        </Section>
      </div>
    </div>
  );
}
