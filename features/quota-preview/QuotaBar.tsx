import type { ReactNode } from "react";
import { Clock, Info } from "lucide-react";
import { HoverTooltip, Skeleton } from "@code-proxy/ui";
import { clampPercent } from "./quota-helpers";

export type QuotaVisualTone = {
  normalized: number | null;
  /** Bar fill: one colour per band (a gradient within the band's hue when bars are semantic). */
  barFillClass: string;
  /** Bar track: neutral, or a faint wash of the band's hue when bars are semantic. */
  barTrackClass: string;
  percentClass: string;
  /**
   * The fill colour for places that cannot take a class (inline conic gradients).
   * A CSS colour, not necessarily hex: the healthy band reads `--cp-bar-healthy`,
   * which follows the appearance setting (styles/index.css).
   */
  fillHex: string;
  /** Chip surface (border + background) mirroring the percent tone. */
  chipClass: string;
  /** Muted label color that stays legible on the chip surface. */
  chipLabelClass: string;
  /** Bar label, on the plain card surface above the bar. */
  barLabelClass: string;
  /** Bar countdown: quieter than the label. */
  barMetaClass: string;
};

export const resolveQuotaVisualTone = (
  percent: number | null | undefined,
): QuotaVisualTone => {
  const normalized = percent === null || percent == null ? null : clampPercent(percent);

  if (normalized === null) {
    return {
      normalized,
      barFillClass: "bg-ink-4",
      barTrackClass: "bg-track",
      percentClass: "text-ink-3",
      fillHex: "#c4c4c4",
      chipClass: "bg-subtle",
      chipLabelClass: "text-ink-2",
      barLabelClass: "text-ink-2",
      barMetaClass: "text-ink-3",
    };
  }

  // The bar is a rule under its label, thick enough (8px by default, 3/4 of that
  // compact; the appearance setting changes it) that bars on neighbouring cards
  // can be compared by length at a glance — the old 4px hairline read as a tint,
  // not as an amount.
  //
  // Colour is a band, not decoration: amber when the window is running low, red
  // when it is nearly gone. While it is healthy the bar is green when the
  // appearance setting asks for semantic bars (the default: each band a gradient
  // within its hue over a faint wash of the same hue, so the remainder reads as
  // "unused") and the accent colour over a neutral track otherwise. The
  // percentage stays ink while healthy and only takes the band's colour once a
  // window needs attention.
  if (normalized >= 60) {
    return {
      normalized,
      barFillClass:
        "bg-accent bar-semantic:bg-gradient-to-r bar-semantic:from-emerald-400 bar-semantic:to-emerald-500 bar-semantic:dark:from-emerald-500 bar-semantic:dark:to-emerald-400",
      barTrackClass: "bg-track bar-semantic:bg-emerald-500/12 bar-semantic:dark:bg-emerald-400/15",
      percentClass: "text-ink",
      fillHex: "var(--cp-bar-healthy)",
      chipClass: "bg-subtle",
      chipLabelClass: "text-ink-2",
      barLabelClass: "text-ink-2",
      barMetaClass: "text-ink-3",
    };
  }

  if (normalized >= 20) {
    return {
      normalized,
      barFillClass:
        "bg-amber-500 dark:bg-amber-400 bar-semantic:bg-gradient-to-r bar-semantic:from-amber-300 bar-semantic:to-amber-500 bar-semantic:dark:from-amber-500 bar-semantic:dark:to-amber-300",
      barTrackClass: "bg-track bar-semantic:bg-amber-500/15 bar-semantic:dark:bg-amber-400/15",
      percentClass: "text-amber-700 dark:text-amber-300",
      fillHex: "#f59e0b",
      chipClass: "bg-amber-50/80 dark:bg-amber-500/[0.1]",
      chipLabelClass: "text-amber-900 dark:text-amber-100/80",
      barLabelClass: "text-ink-2",
      barMetaClass: "text-ink-3",
    };
  }

  return {
    normalized,
    barFillClass:
      "bg-rose-500 dark:bg-rose-400 bar-semantic:bg-gradient-to-r bar-semantic:from-rose-400 bar-semantic:to-rose-500 bar-semantic:dark:from-rose-500 bar-semantic:dark:to-rose-400",
    barTrackClass: "bg-track bar-semantic:bg-rose-500/12 bar-semantic:dark:bg-rose-400/15",
    percentClass: "text-rose-600 dark:text-rose-400",
    fillHex: "#f43f5e",
    chipClass: "bg-rose-50/80 dark:bg-rose-500/[0.1]",
    chipLabelClass: "text-rose-900 dark:text-rose-100/80",
    barLabelClass: "text-ink-2",
    barMetaClass: "text-ink-3",
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
  /**
   * Full text behind an abbreviated `detailText`, surfaced on hover. The bar
   * shows a shortened countdown so it cannot crowd the percentage out; the
   * precise value stays reachable rather than being dropped.
   */
  detailTitle?: string | null;
  /** Icon before `detailText`. Defaults to a clock, which suits a countdown. */
  detailIcon?: ReactNode;
  /** Explains what the window means; rendered as a hoverable info icon. */
  hint?: string;
  compact?: boolean;
  testId?: string;
}

/**
 * One quota window: label, countdown and percentage on one line, a coloured bar
 * beneath.
 *
 * Label, countdown and percentage share the line, which is what makes the
 * numbers scannable down a column instead of hunting between two rows; the bar
 * under them (`h-bar`, `h-bar-sm` compact — 8px / 6px unless the appearance
 * setting changes it) is thick enough to compare by length across cards while
 * a card still fits as many windows as the old one-row pill did.
 *
 * The fill grows in from zero the first time it appears and glides to the new
 * width when a refresh moves the number, so a change is seen rather than
 * silently swapped. Both motions stand down under prefers-reduced-motion.
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
  detailTitle,
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
      className={["flex w-full min-w-0 flex-col", compact ? "gap-1" : "gap-1.5"].join(" ")}
    >
      <div
        className={[
          // leading-tight 而不是 leading-none：标签会 truncate（overflow:hidden），行高等于字号时
          // g、p 这类下伸笔画会被切掉。
          "flex w-full min-w-0 items-center gap-1.5 leading-tight text-xs",
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
                <Info size={11} aria-hidden />
              </span>
            </HoverTooltip>
          ) : null}
        </span>
        {detailText ? (
          <span
            data-testid="quota-bar-detail"
            title={detailTitle ?? undefined}
            className={[
              // `truncate` on this element does nothing: the countdown is an
              // anonymous text run inside a flex container, so text-overflow
              // never applies to it and the string was hard-clipped right up
              // against the percentage — reading as if the number sat on top of
              // it. The text needs its own block box to ellipsize in.
              "inline-flex min-w-0 max-w-[46%] items-center gap-0.5 tabular-nums",
              tone.barMetaClass,
            ].join(" ")}
          >
            {detailIcon ?? (
              <Clock size={10} className="shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate">{detailText}</span>
          </span>
        ) : null}
        <span
          className={[
            "shrink-0 font-semibold tabular-nums",
            compact ? "text-xs" : "text-sm",
            tone.percentClass,
          ].join(" ")}
        >
          {shownPercent}
        </span>
      </div>
      <div
        aria-hidden="true"
        className={[
          "relative w-full overflow-hidden rounded-full",
          tone.barTrackClass,
          compact ? "h-bar-sm" : "h-bar",
        ].join(" ")}
      >
        {normalized ? (
          <div
            data-testid="quota-bar-fill"
            className={[
              "absolute inset-y-0 left-0 rounded-full",
              tone.barFillClass,
              "transition-[width] duration-700 ease-pop",
              "motion-safe:animate-[quota-bar-grow_900ms_cubic-bezier(0.16,1,0.3,1)]",
              "motion-reduce:transition-none",
            ].join(" ")}
            style={{ width: `${normalized}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

// Label widths cycle instead of repeating one length: a column of identical
// grey bars reads as a rendering fault, a varied one reads as text not there
// yet. Percent placeholders stay the same width because real percentages do.
const QUOTA_BAR_SKELETON_LABEL_WIDTHS = ["w-24", "w-20", "w-28", "w-16"];

/**
 * A quota bar that has no numbers yet.
 *
 * Same line height, gap and bar thickness as {@link QuotaBar}, so the rows that
 * appear when the probe lands take exactly the space the placeholders held —
 * the card does not resize under the reader. Used while a first probe is in
 * flight; a refresh that already has values updates them in place instead,
 * since replacing readable numbers with grey bars loses information.
 */
export function QuotaBarSkeleton({
  compact = false,
  labelWidthClass = QUOTA_BAR_SKELETON_LABEL_WIDTHS[0],
}: {
  compact?: boolean;
  labelWidthClass?: string;
}): ReactNode {
  // The neutral tone's own track, so an empty placeholder is the same bar as one
  // whose percentage is unknown.
  const { barTrackClass } = resolveQuotaVisualTone(null);
  return (
    <div
      aria-hidden="true"
      className={["flex w-full flex-col", compact ? "gap-1" : "gap-1.5"].join(" ")}
    >
      <div
        className={[
          // 与真实标签行同一个行高（1.25em），占位到数据之间卡片高度不变。
          "flex h-[1.25em] w-full items-center justify-between gap-2",
          compact ? "text-xs" : "text-sm",
        ].join(" ")}
      >
        <Skeleton className={`h-2.5 ${labelWidthClass}`} rounded="full" />
        <Skeleton className="h-2.5 w-7" rounded="full" />
      </div>
      <div
        className={[
          "w-full rounded-full",
          barTrackClass,
          compact ? "h-bar-sm" : "h-bar",
        ].join(" ")}
      />
    </div>
  );
}

/**
 * A stack of quota-bar placeholders, laid out like the real rows.
 *
 * `rows` should be what the account is expected to report, so the placeholder
 * block is close to the height the data will need.
 */
export function QuotaBarSkeletonList({
  rows,
  compact = false,
  testId,
}: {
  rows: number;
  compact?: boolean;
  testId?: string;
}): ReactNode {
  const safeRows = Math.max(1, Math.min(8, Math.round(rows)));
  return (
    <div
      data-testid={testId}
      aria-hidden="true"
      className={compact ? "space-y-2" : "space-y-3"}
    >
      {Array.from({ length: safeRows }, (_, index) => (
        <QuotaBarSkeleton
          key={index}
          compact={compact}
          labelWidthClass={
            QUOTA_BAR_SKELETON_LABEL_WIDTHS[index % QUOTA_BAR_SKELETON_LABEL_WIDTHS.length]
          }
        />
      ))}
    </div>
  );
}
