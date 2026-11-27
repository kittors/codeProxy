import {
  HoverTooltip,
  formatCompactNumber,
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatUsd,
} from "@code-proxy/ui";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { initSeg } from "satin-ui";
import type { LabStatus, LabSummary } from "./labData";

/** 分段控件（时间范围、演示状态、状态页签共用）：直连 Satin 原生 initSeg 流体滑块。 */
export function Segmented<V extends string | number>({
  value,
  options,
  onChange,
  label,
  role = "radiogroup",
}: {
  id: string;
  value: V | null;
  options: readonly { value: V; label: ReactNode; title?: string }[];
  onChange: (value: V) => void;
  label: string;
  role?: "radiogroup" | "tablist";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const segRef = useRef<ReturnType<typeof initSeg> | null>(null);
  const activeIdx = options.findIndex((option) => option.value === value);
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx;
  const sig = options.map((option) => String(option.value)).join("\u001f");

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const api = initSeg(el, undefined, activeIdxRef.current, {
      role: role === "tablist" ? "tab" : "radio",
      controlled: true,
      fitScroll: false,
      keyboard: false,
    });
    segRef.current = api;
    return () => {
      api.destroy();
      if (segRef.current === api) segRef.current = null;
    };
  }, [role, sig]);

  useLayoutEffect(() => {
    segRef.current?.sync(activeIdx, false);
  }, [activeIdx, sig]);

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={label}
      className="sn-seg sn-sm bg-sn-sunken !inline-flex items-center gap-0.5"
    >
      <span aria-hidden="true" className="sn-thumb" style={{ opacity: 0 }} />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role={role === "tablist" ? "tab" : "radio"}
            aria-selected={role === "tablist" ? active : undefined}
            aria-checked={role === "radiogroup" ? active : undefined}
            title={option.title}
            onClick={() => onChange(option.value)}
            className="relative inline-flex h-7 items-center px-3 text-xs font-medium"
          >
            <span className="relative inline-flex items-center gap-1.5 whitespace-nowrap">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  width = "min-w-[5ch]",
}: {
  label: string;
  value: ReactNode;
  hint: string;
  width?: string;
}) {
  return (
    <HoverTooltip content={hint} placement="bottom">
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-sn-label3">{label}</span>
        <span className={`inline-block font-medium tabular-nums text-sn-label ${width}`}>{value}</span>
      </span>
    </HoverTooltip>
  );
}

export function LabSummaryStrip({
  summary,
  pending,
}: {
  summary: LabSummary | null;
  pending: boolean;
}) {
  const dash = "—";
  const value = (render: (data: LabSummary) => ReactNode) =>
    pending || !summary ? dash : render(summary);
  const successRate = (data: LabSummary) =>
    data.total > 0 ? formatPercent((data.success + data.retried) / data.total) : dash;
  const cacheRate = (data: LabSummary) =>
    data.inputTokens > 0 ? formatPercent(data.cacheReadTokens / data.inputTokens) : dash;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" aria-live="polite">
      <Stat
        label="请求"
        width="min-w-[6ch]"
        value={value((data) => formatInteger(data.total))}
        hint="当前时间范围与筛选条件下的请求数"
      />
      <Stat label="成功率" value={value(successRate)} hint="成功 + 重试后成功，占全部请求的比例" />
      <Stat
        label="输入"
        value={value((data) => formatCompactNumber(data.inputTokens))}
        hint="输入 token 合计（含缓存读取与写入）"
      />
      <Stat
        label="输出"
        value={value((data) => formatCompactNumber(data.outputTokens))}
        hint="输出 token 合计（含推理）"
      />
      <Stat label="缓存命中" value={value(cacheRate)} hint="缓存读取 ÷ 输入合计" />
      <Stat
        label="费用"
        width="min-w-[7ch]"
        value={value((data) => formatUsd(data.cost))}
        hint="按模型目录价格估算的费用合计"
      />
      <Stat
        label="首字中位数"
        width="min-w-[6ch]"
        value={value((data) => formatDurationMs(data.medianFirstTokenMs))}
        hint="一半请求在这个时间内收到第一个 token"
      />
    </div>
  );
}

const STATUS_DOT: Record<LabStatus, string> = {
  success: "bg-emerald-500",
  failed: "bg-rose-500",
  retried: "bg-amber-500",
  cancelled: "bg-sn-label-off",
};

export type StatusTab = "all" | LabStatus;

export function StatusTabs({
  value,
  counts,
  maxCounts,
  onChange,
}: {
  value: StatusTab | null;
  counts: Record<StatusTab, number>;
  maxCounts: Record<StatusTab, number>;
  onChange: (value: StatusTab) => void;
}) {
  const tab = (key: StatusTab, label: string) => ({
    value: key,
    label: (
      <>
        {key !== "all" ? (
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[key]}`} aria-hidden="true" />
        ) : null}
        {label}
        <span
          className="inline-block text-left tabular-nums text-sn-label3"
          style={{ minWidth: `${formatInteger(maxCounts[key]).length}ch` }}
        >
          {formatInteger(counts[key])}
        </span>
      </>
    ),
  });
  return (
    <Segmented
      id="lab-status-tabs"
      role="tablist"
      label="按状态查看"
      value={value}
      onChange={onChange}
      options={[
        tab("all", "全部"),
        tab("success", "成功"),
        tab("failed", "失败"),
        tab("retried", "重试后成功"),
        tab("cancelled", "已取消"),
      ]}
    />
  );
}
