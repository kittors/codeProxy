import type { StatusBarData } from "@/modules/providers/provider-usage";

const blockClass = (state: StatusBarData["blocks"][number]) => {
  if (state === "success") return "bg-emerald-500";
  if (state === "failure") return "bg-rose-500";
  if (state === "mixed") return "bg-amber-500";
  return "bg-slate-200 dark:bg-white/10";
};

export function ProviderStatusBar({ data }: { data: StatusBarData }) {
  const hasData = data.totalSuccess + data.totalFailure > 0;
  const rateText = hasData ? `${data.successRate.toFixed(1)}%` : "--";

  const rateClass = !hasData
    ? "text-slate-400 dark:text-white/40"
    : data.successRate >= 90
      ? "text-emerald-600 dark:text-emerald-300"
      : data.successRate >= 50
        ? "text-amber-600 dark:text-amber-300"
        : "text-rose-600 dark:text-rose-300";

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex flex-1 items-center gap-0.5">
        {data.blocks.map((state, idx) => (
          <div
            key={idx}
            className={"h-2 w-full rounded-sm " + blockClass(state) + " opacity-90 dark:opacity-95"}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className={`w-14 shrink-0 text-right text-xs font-semibold tabular-nums ${rateClass}`}>
        {rateText}
      </span>
    </div>
  );
}
