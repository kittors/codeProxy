import { useCallback, type ReactNode } from "react";
import { Clock, Info } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { resolveQuotaVisualTone } from "../components/QuotaMetricChips";

export type QuotaBarDeps = {
  translateQuotaText: (text: string) => string;
  formatQuotaItemDetailText: (item: QuotaItem | null | undefined) => string | null;
};

/**
 * Render one quota window as a labelled progress bar.
 *
 * Extracted from useAuthFilesFilesPresentation to keep that hook within the
 * file-size ratchet; the deps it needs are passed in rather than captured.
 *
 * Observation age is deliberately not surfaced here. Entering the page always
 * fires a force probe for the visible cards, so an age marker mostly reported
 * the seconds between first paint and that probe landing — noise, not a fault.
 * A probe that genuinely fails is reported by the account's own error state
 * (refresh_state / error_summary on the card), which is where it belongs.
 */
export const renderQuotaBarNode = (
  label: string,
  item: QuotaItem | null,
  compact: boolean,
  deps: QuotaBarDeps,
  hint?: string,
): ReactNode => {
  const { translateQuotaText, formatQuotaItemDetailText } = deps;
  const tone = resolveQuotaVisualTone(item?.percent);
  const normalized = tone.normalized;
  const translatedLabel = translateQuotaText(label);
  const percentText =
    (item?.value ? translateQuotaText(item.value) : undefined) ??
    (normalized === null ? "--" : `${Math.round(normalized)}%`);
  // Keep a fixed-height meta row so bars stay evenly spaced; hide "--" when empty.
  const detailText = formatQuotaItemDetailText(item);
  const tooltipParts = [translatedLabel, percentText];
  if (detailText) tooltipParts.push(detailText);
  // One line per quota: the fill is the row's background rather than a separate
  // track underneath it, so a card fits twice as many windows at the same
  // height. Label, countdown and percentage share the line, which is what makes
  // the numbers scannable down a column instead of hunting between two rows.
  const bar = (
    <div
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
          <span className="min-w-0 truncate">{translatedLabel}</span>
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
            <Clock size={compact ? 9 : 10} className="shrink-0" aria-hidden />
            {detailText}
          </span>
        ) : null}
        <span className={["shrink-0 font-semibold tabular-nums", tone.percentClass].join(" ")}>
          {percentText}
        </span>
      </div>
    </div>
  );

  // ponytail: compact drops reset line; full detail stays in tooltip.
  // Keyed by quota key, not label: two windows can translate to the same label,
  // and a duplicate React key made rows reuse each other's DOM.
  if (!compact) {
    return <div key={item?.key ?? label}>{bar}</div>;
  }
  return (
    <HoverTooltip
      key={item?.key ?? label}
      content={tooltipParts.join(" · ")}
      placement="top"
      className="w-full max-w-full"
    >
      <div className="w-full min-w-0">{bar}</div>
    </HoverTooltip>
  );
};

/**
 * Bind the renderer to its dependencies once.
 *
 * Lives here rather than in useAuthFilesFilesPresentation for the same reason
 * renderQuotaBarNode does: that hook is over the file-size limit and may only
 * shrink, so the wiring belongs next to the thing it wires.
 */
export const useQuotaBarRenderer = (
  translateQuotaText: QuotaBarDeps["translateQuotaText"],
  formatQuotaItemDetailText: QuotaBarDeps["formatQuotaItemDetailText"],
) =>
  useCallback(
    (label: string, item: QuotaItem | null, compact = false, hint?: string): ReactNode =>
      renderQuotaBarNode(
        label,
        item,
        compact,
        { translateQuotaText, formatQuotaItemDetailText },
        hint,
      ),
    [formatQuotaItemDetailText, translateQuotaText],
  );
