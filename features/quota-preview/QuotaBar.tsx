import type { ReactNode } from "react";
import { Clock, Info } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import { clampPercent } from "./quota-helpers";

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

export const resolveQuotaVisualTone = (
  percent: number | null | undefined,
): QuotaVisualTone => {
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

/**
 * Colour band, when the caller's thresholds differ from a quota's.
 *
 * A quota is healthy above 60% remaining; a success rate is not healthy until
 * about 90%, and is alarming below 50%. `auto` derives the band from `percent`,
 * which is right for quotas.
 */
export type QuotaBarTone = "auto" | "positive" | "caution" | "critical";

const TONE_SAMPLE: Record<Exclude<QuotaBarTone, "auto">, number> = {
  positive: 100,
  caution: 40,
  critical: 10,
};

export interface QuotaBarProps {
  label: string;
  /** Remaining percent, 0-100. `null` renders the neutral "unknown" tone. */
  percent: number | null | undefined;
  /** Colour band. Defaults to deriving it from `percent`. */
  tone?: QuotaBarTone;
  /** Percent text, when the source has its own formatting (e.g. "3.2%"). */
  percentText?: string;
  /** Countdown or reset hint, shown beside `detailIcon`. */
  detailText?: string | null;
  /** Icon before `detailText`. Defaults to a clock, which suits a countdown. */
  detailIcon?: ReactNode;
  /** Explains what the window means; rendered as a hoverable info icon. */
  hint?: string;
  compact?: boolean;
  testId?: string;
}

/**
 * One quota window as a labelled bar.
 *
 * The fill is the row's own background rather than a separate track underneath
 * it, so a card fits twice as many windows at the same height. Label, countdown
 * and percentage share the line, which is what makes the numbers scannable down
 * a column instead of hunting between two rows.
 *
 * Shared by the AI accounts and AI providers cards so the two pages read as one
 * component set; neither page should grow its own bar.
 */
export function QuotaBar({
  label,
  percent,
  tone: toneBand = "auto",
  percentText,
  detailText,
  detailIcon,
  hint,
  compact = false,
  testId,
}: QuotaBarProps): ReactNode {
  // Fill width always tracks `percent`; only the colour band can be overridden.
  const tone = resolveQuotaVisualTone(
    toneBand === "auto" ? percent : TONE_SAMPLE[toneBand],
  );
  const normalized = resolveQuotaVisualTone(percent).normalized;
  const shownPercent =
    percentText ?? (normalized === null ? "--" : `${Math.round(normalized)}%`);

  return (
    <div
      data-testid={testId}
      className={[
        "relative flex w-full items-center overflow-hidden rounded-md border",
        tone.barTrackClass,
        compact ? "h-[22px] px-1.5" : "h-6 px-2",
      ].join(" ")}
    >
      {/* No opacity wrapper: the tone ships a tint already light enough to read
          text over, and dimming it further was what made the fill edge — the
          thing that actually encodes the percentage — impossible to locate. */}
      <div
        className={["absolute inset-y-0 left-0", tone.fillClass].join(" ")}
        style={{ width: `${normalized ?? 0}%` }}
        aria-hidden="true"
      />
      <div
        className={[
          "relative z-10 flex w-full items-center gap-1.5 leading-none",
          compact ? "text-2xs" : "text-xs",
        ].join(" ")}
      >
        <span
          className={[
            "inline-flex min-w-0 flex-1 items-center gap-1 font-medium",
            tone.barLabelClass,
          ].join(" ")}
        >
          <span className="min-w-0 truncate">{label}</span>
          {hint ? (
            <HoverTooltip content={hint} placement="top" className="shrink-0">
              <span
                className={[
                  "inline-flex shrink-0 cursor-help transition-opacity hover:opacity-100",
                  tone.barMetaClass,
                ].join(" ")}
                data-testid="quota-bar-hint"
                aria-label={hint}
              >
                <Info size={compact ? 10 : 11} aria-hidden />
              </span>
            </HoverTooltip>
          ) : null}
        </span>
        {detailText ? (
          <span
            className={[
              "inline-flex max-w-[46%] shrink-0 items-center gap-0.5 truncate tabular-nums",
              tone.barMetaClass,
            ].join(" ")}
          >
            {detailIcon ?? (
              <Clock size={compact ? 9 : 10} className="shrink-0" aria-hidden />
            )}
            {detailText}
          </span>
        ) : null}
        <span
          className={["shrink-0 font-semibold tabular-nums", tone.percentClass].join(" ")}
        >
          {shownPercent}
        </span>
      </div>
    </div>
  );
}
