import { useCallback, type ReactNode } from "react";
import { HoverTooltip } from "@code-proxy/ui";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { QuotaBar, resolveQuotaVisualTone } from "@features/quota-preview/QuotaBar";

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
  const bar = (
    <QuotaBar
      label={translatedLabel}
      percent={item?.percent}
      percentText={percentText}
      detailText={detailText}
      hint={hint}
      compact={compact}
    />
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
