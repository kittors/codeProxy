import type { ReactNode } from "react";
import { Gauge } from "lucide-react";
import { QuotaBarSkeletonList } from "@features/quota-preview/QuotaBar";
import type { QuotaProvider } from "@features/quota-preview/quota-fetch";
import { expectedQuotaSlotCount, type QuotaCardSlot } from "../hooks/quotaCardSlots";

export interface AuthFileCardQuotaProps {
  slots: QuotaCardSlot[];
  provider: QuotaProvider | null;
  /**
   * A probe is in flight and this account has never reported quota, so the area
   * should hold placeholders rather than claim there is none.
   * @see shouldShowQuotaPlaceholder
   */
  probing: boolean;
  dense: boolean;
  renderQuotaBar: (
    label: string,
    item: QuotaCardSlot["item"],
    compact?: boolean,
    hint?: string,
  ) => ReactNode;
  /** Shown when the account has no quota to report and nothing is running. */
  emptyLabel: string;
}

/**
 * The quota region of an AI account card.
 *
 * Three states rather than two. Rows, when there is data — including during a
 * refresh, because the values that are already on screen are still true and
 * blanking them out to grey would cost the reader more than the wait. Bar-shaped
 * placeholders during a first probe, so the block that appears is the size of
 * the block that will replace it. The empty state only once it is settled that
 * this account reports nothing.
 */
export function AuthFileCardQuota({
  slots,
  provider,
  probing,
  dense,
  renderQuotaBar,
  emptyLabel,
}: AuthFileCardQuotaProps) {
  if (slots.length > 0) {
    return (
      <div className={dense ? "space-y-2" : "space-y-3"} aria-busy={probing || undefined}>
        {slots.map((slot) => renderQuotaBar(slot.label, slot.item, dense, slot.hint))}
      </div>
    );
  }

  if (probing) {
    return (
      // The bars are hidden from assistive tech, so the wrapper carries the
      // "still loading" state the reader would otherwise not get.
      <div aria-busy="true">
        <QuotaBarSkeletonList
          rows={expectedQuotaSlotCount(provider)}
          compact={dense}
          testId="auth-file-card-quota-skeleton"
        />
      </div>
    );
  }

  return (
    <div
      className={[
        "flex flex-1 flex-col items-center justify-center gap-2 text-center",
        dense ? "py-3" : "py-6",
      ].join(" ")}
      data-testid="auth-file-card-quota-empty"
    >
      <div
        className={[
          "flex items-center justify-center rounded-full bg-slate-100/90 text-slate-400 dark:bg-white/[0.06] dark:text-white/40",
          dense ? "h-7 w-7" : "h-9 w-9",
        ].join(" ")}
        aria-hidden="true"
      >
        <Gauge size={dense ? 14 : 16} strokeWidth={1.5} />
      </div>
      <p className="text-xs font-medium text-slate-500 dark:text-white/50">{emptyLabel}</p>
    </div>
  );
}
