import { useTranslation } from "react-i18next";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import type { IpAccessStatus } from "@code-proxy/api-client";

/**
 * One compact line, not a paragraph.
 *
 * The state it reports is genuinely important — with trusted-proxies unset every
 * rule is stored, listed and enforces nothing — but importance is not a licence
 * to occupy a quarter of the viewport on every visit. The remedy is now a button
 * on the Protection tab rather than a config snippet to go paste, so the banner
 * only has to point at it.
 */
export function TrustBanner({ status }: { status: IpAccessStatus | null }) {
  const { t } = useTranslation();

  if (!status) return null;

  if (!status.storage_available) {
    return (
      <Banner tone="warning" icon={<TriangleAlert size={15} aria-hidden="true" />}>
        <span className="font-medium">{t("ip_access.banner_no_storage")}</span>
      </Banner>
    );
  }

  if (!status.trusted) {
    return (
      <Banner tone="danger" icon={<ShieldAlert size={15} aria-hidden="true" />}>
        <span className="font-medium">{t("ip_access.banner_untrusted")}</span>
        <span className="text-xs opacity-80">
          {t("ip_access.banner_untrusted_hint", { ip: status.client_ip || "-" })}
        </span>
        <span className="text-xs opacity-80">{t("ip_access.banner_fix_hint")}</span>
      </Banner>
    );
  }

  if (status.dropped_events && status.dropped_events > 0) {
    return (
      <Banner tone="warning" icon={<TriangleAlert size={15} aria-hidden="true" />}>
        <span className="font-medium">
          {t("ip_access.banner_dropped", { count: status.dropped_events })}
        </span>
      </Banner>
    );
  }

  return null;
}

const TONE_CLASS = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200",
} as const;

function Banner({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONE_CLASS;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border px-4 py-2 text-sm ${TONE_CLASS[tone]}`}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </div>
  );
}
