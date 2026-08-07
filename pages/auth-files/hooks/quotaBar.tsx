import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { Clock } from "lucide-react";
import { isQuotaObservationStale } from "@code-proxy/domain";
import { HoverTooltip } from "@code-proxy/ui";
import type { QuotaItem } from "@features/quota-preview/quota-helpers";
import { resolveQuotaVisualTone } from "../components/QuotaMetricChips";

export type QuotaBarDeps = {
  t: TFunction;
  nowMs: number;
  translateQuotaText: (text: string) => string;
  formatQuotaItemDetailText: (item: QuotaItem | null | undefined) => string | null;
  formatQuotaAgeCompact: (observedAtMs?: number) => string | null;
};

/**
 * Render one quota window as a labelled progress bar.
 *
 * Extracted from useAuthFilesFilesPresentation to keep that hook within the
 * file-size ratchet; the deps it needs are passed in rather than captured.
 */
export const renderQuotaBarNode = (
  label: string,
  item: QuotaItem | null,
  compact: boolean,
  deps: QuotaBarDeps,
): ReactNode => {
  const { t, nowMs, translateQuotaText, formatQuotaItemDetailText, formatQuotaAgeCompact } = deps;
    const tone = resolveQuotaVisualTone(item?.percent);
    const normalized = tone.normalized;
    const translatedLabel = translateQuotaText(label);
    const percentText =
      (item?.value ? translateQuotaText(item.value) : undefined) ??
      (normalized === null ? "--" : `${Math.round(normalized)}%`);
    // Keep a fixed-height meta row so bars stay evenly spaced; hide "--" when empty.
    const detailText = formatQuotaItemDetailText(item);
    // A value the upstream stopped confirming keeps its countdown ticking off a
    // frozen reset time, which reads as live data. Desaturate it and state its
    // age so an unrefreshed number can never pass for a current one.
    const stale = isQuotaObservationStale(item?.observedAtMs, nowMs);
    const ageText = stale ? formatQuotaAgeCompact(item?.observedAtMs) : null;
    const staleText = ageText ? t("m_quota.stale_observed", { age: ageText }) : null;
    const tooltipParts = [translatedLabel, percentText];
    if (detailText) tooltipParts.push(detailText);
    if (ageText) tooltipParts.push(t("m_quota.stale_tooltip", { age: ageText }));
    const bar = (
      <div className={compact ? "space-y-1" : "space-y-1.5"}>
        <div className="flex items-center justify-between gap-1.5">
          <span
            className={[
              "inline-flex min-w-0 items-center gap-1 font-medium text-slate-600 dark:text-white/70",
              compact ? "text-2xs" : "gap-1.5 text-xs",
            ].join(" ")}
          >
            <Clock
              size={compact ? 11 : 12}
              className="shrink-0 text-slate-400 dark:text-white/40"
              aria-hidden
            />
            <span className="min-w-0 truncate">{translatedLabel}</span>
          </span>
          <span
            className={[
              "shrink-0 font-semibold tabular-nums",
              compact ? "text-2xs" : "text-xs",
              stale ? "text-slate-400 dark:text-white/40" : tone.percentClass,
            ].join(" ")}
          >
            {percentText}
          </span>
        </div>
        <div
          className={[
            "w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10",
            compact ? "h-1.5" : "h-2",
          ].join(" ")}
        >
          <div
            className={[
              "h-full rounded-full",
              tone.fillClass,
              stale ? "opacity-40 saturate-50" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ width: `${normalized ?? 0}%` }}
            aria-hidden="true"
          />
        </div>
        {compact ? null : (
          <div className="flex min-h-[14px] items-center justify-between gap-2 text-2xs">
            <span className="min-w-0 truncate text-amber-600 dark:text-amber-300/80">
              {staleText ?? "\u00A0"}
            </span>
            <span className="shrink-0 truncate tabular-nums text-slate-400 dark:text-white/40">
              {detailText ?? "\u00A0"}
            </span>
          </div>
        )}
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
