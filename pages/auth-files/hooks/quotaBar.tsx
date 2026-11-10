import { useCallback, type ReactNode } from "react";
import { HoverTooltip } from "@code-proxy/ui";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { QuotaBar, resolveQuotaVisualTone } from "@features/quota-preview/QuotaBar";
import {
  useQuotaWindowSpendText,
  type QuotaWindowSpendText,
} from "@features/quota-preview/quota-spend";

export type QuotaBarDeps = {
  translateQuotaText: (text: string) => string;
  /** Full detail text, e.g. "7天22小时35分57秒". Used for tooltips and hover. */
  formatQuotaItemDetailText: (item: QuotaItem | null | undefined) => string | null;
  /**
   * Abbreviated detail for the bar's own line. Defaults to the full text, which
   * is what the tests and any caller without a short form need.
   */
  formatQuotaItemDetailTextShort?: (item: QuotaItem | null | undefined) => string | null;
  /**
   * The window's spend, when the backend reports one. Omitted, the bar shows no
   * amount — which is also what an older backend without the field gets.
   */
  describeQuotaItemSpend?: (item: QuotaItem | null | undefined) => QuotaWindowSpendText | null;
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
  const {
    translateQuotaText,
    formatQuotaItemDetailText,
    formatQuotaItemDetailTextShort,
    describeQuotaItemSpend,
  } = deps;
  const tone = resolveQuotaVisualTone(item?.percent);
  const normalized = tone.normalized;
  const translatedLabel = translateQuotaText(label);
  // Rows composed as "<group> · <window>" keep the window when the line is
  // short: the group name truncates instead. A four-column card with the
  // window's spend printed beside the countdown cut "每周" off both of
  // Antigravity's third-party rows, leaving two rows with the same label.
  const separatorAt = translatedLabel.lastIndexOf(" · ");
  const labelHead = separatorAt > 0 ? translatedLabel.slice(0, separatorAt) : translatedLabel;
  const labelSuffix = separatorAt > 0 ? translatedLabel.slice(separatorAt + 1) : null;
  const percentText =
    (item?.value ? translateQuotaText(item.value) : undefined) ??
    (normalized === null ? "--" : `${Math.round(normalized)}%`);
  // Keep a fixed-height meta row so bars stay evenly spaced; hide "--" when empty.
  const detailText = formatQuotaItemDetailText(item);
  // The bar prints the short countdown; the full one stays in the tooltip and
  // on the countdown's own hover title, so no precision is lost by shortening.
  const shortDetailText = formatQuotaItemDetailTextShort?.(item) ?? detailText;
  const spend = describeQuotaItemSpend?.(item) ?? null;
  const tooltipParts = [translatedLabel, percentText];
  if (detailText) tooltipParts.push(detailText);
  if (spend) tooltipParts.push(spend.title);
  const bar = (
    <QuotaBar
      label={labelHead}
      labelSuffix={labelSuffix}
      percent={item?.percent}
      percentText={percentText}
      detailText={shortDetailText}
      detailTitle={detailText !== shortDetailText ? detailText : null}
      spendText={spend?.text}
      spendTitle={spend?.title}
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
  formatQuotaItemDetailTextShort?: QuotaBarDeps["formatQuotaItemDetailTextShort"],
) => {
  // Bound here rather than passed in, for the same file-size reason as above.
  const describeQuotaItemSpend = useQuotaWindowSpendText();
  return useCallback(
    (label: string, item: QuotaItem | null, compact = false, hint?: string): ReactNode =>
      renderQuotaBarNode(
        label,
        item,
        compact,
        {
          translateQuotaText,
          formatQuotaItemDetailText,
          formatQuotaItemDetailTextShort,
          describeQuotaItemSpend,
        },
        hint,
      ),
    [
      describeQuotaItemSpend,
      formatQuotaItemDetailText,
      formatQuotaItemDetailTextShort,
      translateQuotaText,
    ],
  );
};
