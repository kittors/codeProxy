import { Skeleton } from "@code-proxy/ui";
import type { StatusBarData } from "@code-proxy/domain";
import { ProviderStatusBar } from "@features/provider-latency";

export interface AuthFileSuccessRateCellProps {
  data: StatusBarData;
  /** Usage totals have been loaded for the page, even if this row has none. */
  ready: boolean;
  /** Usage totals are being fetched. */
  loading: boolean;
}

/**
 * The success-rate column of the AI accounts table.
 *
 * While the totals load, the cell holds a bar-shaped placeholder rather than a
 * spinner and the word "Loading": the spinner said "busy" without saying what
 * would appear, and repeated down a column of rows it was the noisiest thing on
 * the page. "--" stays for a row whose totals are in and genuinely empty.
 */
export function AuthFileSuccessRateCell({ data, ready, loading }: AuthFileSuccessRateCellProps) {
  const hasUsage = data.totalSuccess + data.totalFailure > 0;
  if (ready || hasUsage) return <ProviderStatusBar data={data} compact />;

  if (loading) {
    return (
      <div className="flex min-w-0 items-center gap-2 px-2 py-1" aria-hidden="true">
        <Skeleton className="h-1.5 flex-1" rounded="sm" />
        <Skeleton className="h-3 w-10 shrink-0" rounded="full" />
      </div>
    );
  }

  return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
}
