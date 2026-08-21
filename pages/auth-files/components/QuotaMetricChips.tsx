import type { ReactNode } from "react";
import { Clock } from "lucide-react";
import { clampPercent, type QuotaItem } from "@features/quota-preview/quota-helpers";

export type QuotaVisualTone = {
  normalized: number | null;
  /**
   * Bar fill: a light tint plus a 2px rule down its right edge. The rule is
   * what marks the percentage, which frees the tint to stay light enough to
   * read text over.
   */
  fillClass: string;
  percentClass: string;
  fillHex: string;
  /** Chip surface (border + background) mirroring the percent tone. */
  chipClass: string;
  /** Muted label color that stays legible on the chip surface. */
  chipLabelClass: string;
  /** Bar track: border, plus the background showing left of the fill. */
  barTrackClass: string;
  /** Bar label, which sits over the fill and has to read against it. */
  barLabelClass: string;
  /** Bar countdown: quieter than the label, still legible over the fill. */
  barMetaClass: string;
};

export const resolveQuotaVisualTone = (percent: number | null | undefined): QuotaVisualTone => {
  const normalized = percent === null || percent == null ? null : clampPercent(percent);

  if (normalized === null) {
    return {
      normalized,
      fillClass:
        "border-r-2 border-slate-300 bg-slate-100 dark:border-white/20 dark:bg-white/[0.07]",
      percentClass: "text-slate-900 dark:text-white",
      fillHex: "#cbd5e1",
      chipClass: "border-slate-900/8 bg-slate-50 dark:border-white/10 dark:bg-white/[0.06]",
      chipLabelClass: "text-slate-600 dark:text-white/70",
      barTrackClass: "border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]",
      barLabelClass: "text-slate-700 dark:text-white/80",
      barMetaClass: "text-slate-500 dark:text-white/50",
    };
  }

  // The bar's fill is the row's own background, so at 100% it covers the entire
  // line — and repeated down a grid of cards, a saturated fill becomes a wall of
  // colour that is tiring to look at and, being always on, signals nothing.
  //
  // So the tint stays light and a 2px rule at the fill's right edge carries the
  // percentage instead. The edge marks the value more precisely than a block
  // boundary does, and the label keeps its contrast because it is no longer
  // sitting on a saturated ground.
  if (normalized >= 60) {
    return {
      normalized,
      fillClass:
        "border-r-2 border-emerald-400 bg-emerald-100 dark:border-emerald-400/70 dark:bg-emerald-500/20",
      percentClass: "text-emerald-900 dark:text-emerald-100",
      fillHex: "#10b981",
      chipClass:
        "border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]",
      chipLabelClass: "text-emerald-900 dark:text-emerald-100/80",
      barTrackClass: "border-emerald-200 bg-white dark:border-emerald-500/20 dark:bg-white/[0.03]",
      barLabelClass: "text-emerald-900 dark:text-emerald-50",
      barMetaClass: "text-emerald-700 dark:text-emerald-200/70",
    };
  }

  if (normalized >= 20) {
    return {
      normalized,
      fillClass:
        "border-r-2 border-amber-400 bg-amber-100 dark:border-amber-400/70 dark:bg-amber-500/20",
      percentClass: "text-amber-900 dark:text-amber-100",
      fillHex: "#f59e0b",
      chipClass:
        "border-amber-200/70 bg-amber-50/70 dark:border-amber-500/20 dark:bg-amber-500/[0.08]",
      chipLabelClass: "text-amber-900 dark:text-amber-100/80",
      barTrackClass: "border-amber-200 bg-white dark:border-amber-500/20 dark:bg-white/[0.03]",
      barLabelClass: "text-amber-900 dark:text-amber-50",
      barMetaClass: "text-amber-700 dark:text-amber-200/70",
    };
  }

  return {
    normalized,
    fillClass: "border-r-2 border-rose-400 bg-rose-100 dark:border-rose-400/70 dark:bg-rose-500/20",
    percentClass: "text-rose-900 dark:text-rose-100",
    fillHex: "#f43f5e",
    chipClass: "border-rose-200/70 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-500/[0.08]",
    chipLabelClass: "text-rose-900 dark:text-rose-100/80",
    barTrackClass: "border-rose-200 bg-white dark:border-rose-500/20 dark:bg-white/[0.03]",
    barLabelClass: "text-rose-900 dark:text-rose-50",
    barMetaClass: "text-rose-700 dark:text-rose-200/70",
  };
};

/** Ring that mirrors the percent without spending a full progress-bar row. */
export function QuotaProgressRing({ percent }: { percent: number | null }) {
  const tone = resolveQuotaVisualTone(percent);
  const normalized = tone.normalized;
  const deg = normalized === null ? 0 : Math.max(0, Math.min(360, (normalized / 100) * 360));

  return (
    <span
      className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 rounded-full dark:hidden"
        style={{
          background: `conic-gradient(${tone.fillHex} ${deg}deg, rgba(148, 163, 184, 0.35) 0deg)`,
        }}
      />
      <span
        className="absolute inset-0 hidden rounded-full dark:block"
        style={{
          background: `conic-gradient(${tone.fillHex} ${deg}deg, rgba(255, 255, 255, 0.14) 0deg)`,
        }}
      />
      <span className="absolute inset-[2px] rounded-full bg-white dark:bg-neutral-950" />
    </span>
  );
}

// Chips pack label, reset countdown and percent onto one line, so a half-width
// chip fits far less label text than the old stacked bar did.
const QUOTA_METRIC_WIDE_LABEL_UNITS = 16;

const getQuotaMetricDisplayUnits = (value: string | null | undefined): number =>
  Array.from(value ?? "").reduce(
    (total, char) => total + ((char.codePointAt(0) ?? 0) > 0xff ? 2 : 1),
    0,
  );

export const resolveQuotaMetricWideFlags = (
  metrics: { label: string; metaText: string | null }[],
): boolean[] => {
  const wideFlags = metrics.map(
    ({ label, metaText }) =>
      metrics.length === 1 ||
      // Money meta ("$1452.81 / $1500.00") never fits beside label + countdown.
      Boolean(metaText) ||
      getQuotaMetricDisplayUnits(label) > QUOTA_METRIC_WIDE_LABEL_UNITS,
  );

  let compactSegmentStart = 0;
  for (let index = 0; index <= wideFlags.length; index += 1) {
    if (index < wideFlags.length && !wideFlags[index]) continue;
    const compactSegmentLength = index - compactSegmentStart;
    if (compactSegmentLength % 2 === 1) {
      wideFlags[index - 1] = true;
    }
    compactSegmentStart = index + 1;
  }

  return wideFlags;
};

export type QuotaMetricSlot = { id: string; label: string; item: QuotaItem | null };

export interface QuotaMetricChipsProps {
  slots: QuotaMetricSlot[];
  /** Rendered above the chips when the last refresh failed but stale data remains. */
  errorBadge?: ReactNode;
  /** Money-style meta ("$40 / $50"); other meta is dropped by the caller. */
  resolveMetaText: (item: QuotaItem | null) => string | null;
  /** Two-unit countdown to the window reset ("2d19h"). */
  resolveResetText: (item: QuotaItem | null) => string | null;
  resolvePercentText: (item: QuotaItem | null, tone: QuotaVisualTone) => string;
}

/**
 * Quota metrics as inline chips: label, optional money meta, reset countdown and
 * percent all read directly in the row, so the grid needs no hover layer.
 */
export function QuotaMetricChips({
  slots,
  errorBadge,
  resolveMetaText,
  resolveResetText,
  resolvePercentText,
}: QuotaMetricChipsProps) {
  const metaTexts = slots.map((slot) => resolveMetaText(slot.item));
  const wideFlags = resolveQuotaMetricWideFlags(
    slots.map((slot, index) => ({ label: slot.label, metaText: metaTexts[index] ?? null })),
  );

  return (
    <div
      className="grid w-full min-w-0 grid-cols-2 gap-1.5 py-0.5"
      data-testid="auth-file-quota-grid"
    >
      {errorBadge ? <div className="col-span-2">{errorBadge}</div> : null}
      {slots.map((slot, index) => {
        const tone = resolveQuotaVisualTone(slot.item?.percent);
        const metaText = metaTexts[index] ?? null;
        const resetText = resolveResetText(slot.item);
        const wide = wideFlags[index] ?? false;

        return (
          <div
            key={slot.id}
            className={[
              "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1",
              tone.chipClass,
              wide ? "col-span-2" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-layout={wide ? "wide" : "compact"}
            data-testid="auth-file-quota-metric"
          >
            <QuotaProgressRing percent={slot.item?.percent ?? null} />
            <span
              title={slot.label}
              className={["min-w-0 flex-1 truncate text-2xs font-semibold", tone.chipLabelClass].join(
                " ",
              )}
            >
              {slot.label}
            </span>
            {metaText ? (
              <span className="shrink-0 whitespace-nowrap text-2xs tabular-nums text-slate-500 dark:text-white/45">
                {metaText}
              </span>
            ) : null}
            {resetText ? (
              <span
                data-testid="auth-file-quota-reset"
                className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-2xs tabular-nums text-slate-500 dark:text-white/45"
              >
                <Clock size={10} className="shrink-0 opacity-70" aria-hidden />
                {resetText}
              </span>
            ) : null}
            <span
              className={[
                "shrink-0 whitespace-nowrap text-2xs font-semibold tabular-nums",
                tone.percentClass,
              ].join(" ")}
            >
              {resolvePercentText(slot.item, tone)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
