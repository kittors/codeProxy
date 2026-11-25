import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CalendarCheck, CalendarClock } from "@code-proxy/ui/icons";
import { HoverTooltip } from "@code-proxy/ui";
import type { AuthFileSubscriptionStatus } from "@code-proxy/domain";
import { SUBSCRIPTION_TONE_CLASSES } from "../hooks/presentationStyles";

const DAY_MS = 24 * 60 * 60 * 1000;

const formatMs = (ms: number | null | undefined): string =>
  typeof ms === "number" ? new Date(ms).toLocaleString() : "";

/**
 * One line saying where the dates come from and what happens next: a live read
 * names the renewal (or why there is none) and when the provider confirmed it; a
 * manual entry shows the typed start; a token snapshot says it is one.
 */
export function describeAuthFileSubscription(
  status: AuthFileSubscriptionStatus,
  t: TFunction,
): string {
  const period = t(`auth_files.subscription_period_${status.period}`);
  if (status.source === "live") {
    const checked = formatMs(status.checkedAtMs);
    switch (status.state) {
      case "inactive":
        return t("auth_files.subscription_live_inactive_title", { checked });
      case "past_due":
        return t("auth_files.subscription_live_past_due_title", {
          period,
          date: status.expiresAtText,
          checked,
        });
      case "canceling":
        return t("auth_files.subscription_live_canceling_title", {
          period,
          date: formatMs(status.cancelsAtMs ?? status.expiresAtMs),
          checked,
        });
      default:
        return t("auth_files.subscription_live_active_title", {
          period,
          date: formatMs(status.renewsAtMs ?? status.expiresAtMs),
          checked,
        });
    }
  }
  if (status.source === "claims") {
    return t("auth_files.subscription_claims_title", { date: status.expiresAtText });
  }
  return t("auth_files.subscription_expires_at_title", {
    start: status.startedAtText,
    date: status.expiresAtText,
    period,
  });
}

interface AuthFileSubscriptionBadgeProps {
  status: AuthFileSubscriptionStatus;
  nowMs: number;
}

/** Remaining time on the card; a live read gets the check-mark calendar. */
export function AuthFileSubscriptionBadge({ status, nowMs }: AuthFileSubscriptionBadgeProps) {
  const { t } = useTranslation();
  const days = Math.max(0, Math.abs(status.remainingDays));
  let label: string;
  if (status.expiresAtMs === null) {
    label = t("auth_files.subscription_inactive_short");
  } else if (status.expired) {
    label = t("auth_files.subscription_expired_short", { days });
  } else if (status.expiresAtMs - nowMs < DAY_MS) {
    label = t("auth_files.subscription_remaining_less_than_day");
  } else {
    label = t("auth_files.subscription_remaining_short", { days });
  }
  const Icon = status.source === "live" ? CalendarCheck : CalendarClock;

  return (
    <HoverTooltip content={describeAuthFileSubscription(status, t)}>
      <span
        data-subscription-source={status.source}
        className={[
          "inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-semibold tabular-nums",
          SUBSCRIPTION_TONE_CLASSES[status.tone],
        ].join(" ")}
      >
        <Icon size={11} className="shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </span>
    </HoverTooltip>
  );
}
