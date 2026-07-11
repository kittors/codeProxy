import { type ReactNode } from "react";

type MetricTone = "slate" | "emerald" | "rose" | "amber" | "blue";

interface ProviderMetricChipProps {
  tone: MetricTone;
  icon?: ReactNode;
  label: string;
  value?: number | string;
  title?: string;
}

const toneClass: Record<MetricTone, string> = {
  slate: "bg-slate-600/10 text-slate-700 dark:bg-white/10 dark:text-white/65",
  emerald:
    "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  rose: "bg-rose-600/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  amber:
    "bg-amber-500/15 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  blue: "bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
};

export function ProviderMetricChip({
  tone,
  icon,
  label,
  value,
  title,
}: ProviderMetricChipProps) {
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass[tone]}`}
      title={title}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
      {value !== undefined ? (
        <span className="shrink-0 tabular-nums">{value}</span>
      ) : null}
    </span>
  );
}
