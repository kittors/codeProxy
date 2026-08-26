import type { ReactNode } from "react";
import type { QuotaState, QuotaItem } from "@features/quota-preview/quota-helpers";
import { filterAntigravityQuotaItems } from "@features/quota-preview/quota-helpers";
import type { QuotaProvider } from "@features/quota-preview/quota-fetch";
import { expectedQuotaSlotCount } from "../hooks/quotaCardSlots";
import { shouldShowQuotaPlaceholder } from "../hooks/quotaProbeState";
import {
  QuotaMetricChips,
  QuotaMetricChipsSkeleton,
  type QuotaMetricSlot,
  type QuotaVisualTone,
} from "./QuotaMetricChips";

export interface AuthFileQuotaCellProps {
  /** `null` for an account whose provider reports no quota at all. */
  provider: QuotaProvider | null;
  state: QuotaState;
  /**
   * A page-wide read of the status model is in flight — the table passes its
   * snapshot load, which is the phase where a row has no data yet.
   * @see shouldShowQuotaPlaceholder
   */
  pageProbing: boolean;
  resolveSlots: (provider: QuotaProvider, items: QuotaItem[]) => QuotaMetricSlot[];
  renderErrorBadge: (errorText: string) => ReactNode;
  resolveMetaText: (item: QuotaItem | null) => string | null;
  resolveResetText: (item: QuotaItem | null) => string | null;
  resolvePercentText: (item: QuotaItem | null, tone: QuotaVisualTone) => string;
  /** Fallback label for an error with no message of its own. */
  errorText: string;
}

const Dash = () => <span className="text-xs text-slate-400 dark:text-white/40">--</span>;

/**
 * The quota column of the AI accounts table.
 *
 * Four states, kept apart on purpose: no quota concept for this provider, a
 * failed probe with nothing cached, a probe still running, and data. The middle
 * two both used to print "--", so a row that was merely still loading looked
 * exactly like one that had nothing to report.
 */
export function AuthFileQuotaCell({
  provider,
  state,
  pageProbing,
  resolveSlots,
  renderErrorBadge,
  resolveMetaText,
  resolveResetText,
  resolvePercentText,
  errorText,
}: AuthFileQuotaCellProps) {
  if (!provider) return <Dash />;

  const rawItems = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
  const items = provider === "antigravity" ? filterAntigravityQuotaItems(rawItems) : rawItems;
  const slots = resolveSlots(provider, items);
  const hasError = state.status === "error" || Boolean(state.error);

  if (slots.length === 0) {
    if (hasError) return renderErrorBadge(state.error ?? errorText);
    // Placeholders only while a probe is in flight; "--" stays reserved for an
    // account that genuinely reports nothing.
    if (shouldShowQuotaPlaceholder(state, pageProbing)) {
      return <QuotaMetricChipsSkeleton chips={expectedQuotaSlotCount(provider)} />;
    }
    return <Dash />;
  }

  return (
    <QuotaMetricChips
      slots={slots}
      errorBadge={hasError ? renderErrorBadge(state.error ?? errorText) : undefined}
      resolveMetaText={resolveMetaText}
      resolveResetText={resolveResetText}
      resolvePercentText={resolvePercentText}
    />
  );
}
