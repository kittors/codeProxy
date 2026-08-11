import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ShieldAlert, TriangleAlert } from "lucide-react";
import type { IpAccessStatus } from "@code-proxy/api-client";

/**
 * One compact line, not a paragraph.
 *
 * The state it reports is genuinely important — with trusted-proxies unset every
 * rule is stored, listed and enforces nothing — but importance is not a licence
 * to occupy a quarter of the viewport on every visit. The fix is a single
 * copyable config line, so that is what the banner shows; the reasoning lives in
 * the tooltip and the docs.
 */
export function TrustBanner({ status }: { status: IpAccessStatus | null }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!status) return null;

  const suggestion = status.suggested_trusted_proxies?.[0] ?? "";
  const configLine = suggestion ? `trusted-proxies: ["${suggestion}"]` : "";

  const copySuggestion = async () => {
    if (!configLine) return;
    try {
      await navigator.clipboard.writeText(configLine);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the line stays selectable on screen.
    }
  };

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
        {configLine ? (
          <>
            <code className="rounded-lg bg-black/5 px-2 py-0.5 font-mono text-xs dark:bg-white/10">
              {configLine}
            </code>
            <button
              type="button"
              onClick={copySuggestion}
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? t("ip_access.copied") : t("ip_access.copy_config")}
            </button>
          </>
        ) : null}
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
