import { type ReactNode } from "react";

type MetricTone = "slate" | "emerald" | "rose" | "amber" | "blue";

interface ProviderMetricChipProps {
  tone: MetricTone;
  icon?: ReactNode;
  label: string;
  value?: number | string;
  title?: string;
}

// Squared corners, 2xs type, flat tint: the badge language of the AI accounts
// card, so a provider card and an account card read as the same component.
const toneClass: Record<MetricTone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70",
  emerald:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200",
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
      className={`inline-flex h-5 min-w-0 max-w-full shrink-0 items-center gap-1 rounded-md px-1.5 text-2xs font-semibold leading-none ${toneClass[tone]}`}
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
