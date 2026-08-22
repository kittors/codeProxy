import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import type { StatusBarData } from "@code-proxy/domain";
import { QuotaBar } from "@features/quota-preview/QuotaBar";

/**
 * Recent-request success rate, drawn as the card's quota bars are.
 *
 * It used to be a strip of ~21 one-pixel-ish blocks plus a percentage. In a
 * footer sized to its content that strip came out 95px wide, so the blocks were
 * about 4px each — unreadable, and all that was left to read was a percentage
 * floating on its own. The same bar the quota windows use gives the number a
 * shape: a full-width row whose fill is the rate and whose label says what it
 * is. The per-window detail moves into the tooltip, where it is legible.
 *
 * Thresholds are the success-rate ones (90 / 50), not a quota's (60 / 20): a
 * channel failing one call in four is in trouble, while a quota at 75% is fine.
 */
export function ProviderSuccessRateBar({ data }: { data: StatusBarData }) {
  const { t } = useTranslation();
  const total = data.totalSuccess + data.totalFailure;
  if (total === 0) return null;

  const rate = data.successRate;
  const tone = rate >= 90 ? "positive" : rate >= 50 ? "caution" : "critical";

  return (
    <HoverTooltip
      content={[
        t("providers.success_stats", { count: data.totalSuccess }),
        t("providers.failed_stats", { count: data.totalFailure }),
      ].join(" · ")}
      placement="top"
      className="w-full min-w-0"
    >
      <div className="w-full min-w-0">
        <QuotaBar
          label={t("common.success_rate")}
          percent={rate}
          tone={tone}
          percentText={`${rate.toFixed(1)}%`}
          detailText={t("providers.request_total", { count: total })}
          detailIcon={<Activity size={10} className="shrink-0" aria-hidden />}
          testId="provider-success-rate"
        />
      </div>
    </HoverTooltip>
  );
}
