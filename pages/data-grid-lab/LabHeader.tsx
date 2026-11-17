import {
  HoverTooltip,
  formatCompactNumber,
  formatDurationMs,
  formatInteger,
  formatPercent,
  formatUsd,
} from "@code-proxy/ui";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import type { LabStatus, LabSummary } from "./labData";

/** 分段控件（时间范围、演示状态、状态页签共用）：选中块在选项之间滑动。 */
export function Segmented<V extends string | number>({
  id,
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
  const reduceMotion = useReducedMotion();
  return (
    <LayoutGroup id={id}>
      <div
        role={role}
        aria-label={label}
        className="inline-flex items-center gap-0.5 rounded-full bg-track p-1"
      >
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
              className={[
                "relative inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors duration-150",
                active ? "text-ink" : "text-ink-2 hover:text-ink",
              ].join(" ")}
            >
              {active ? (
                <motion.span
                  layoutId="segment"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-surface shadow-control"
                  transition={
                    reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }
                  }
                />
              ) : null}
              <span className="relative inline-flex items-center gap-1.5 whitespace-nowrap">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <HoverTooltip content={hint} placement="bottom">
      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-ink-3">{label}</span>
        <span className="font-medium tabular-nums text-ink">{value}</span>
      </span>
    </HoverTooltip>
  );
}

/** 标题下的一行汇总：跟随当前筛选重算，悬停每一项看口径。 */
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
        value={value((data) => formatUsd(data.cost))}
        hint="按模型目录价格估算的费用合计"
      />
      <Stat
        label="首字中位数"
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
  cancelled: "bg-ink-4",
};

export type StatusTab = "all" | LabStatus;

export function StatusTabs({
  value,
  counts,
  onChange,
}: {
  value: StatusTab | null;
  counts: Record<StatusTab, number>;
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
        <span className="tabular-nums text-ink-3">{formatInteger(counts[key])}</span>
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
