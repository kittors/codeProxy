import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { IpAccessStatus } from "@code-proxy/api-client";

/**
 * The feature has a silent failure mode: behind a reverse proxy with no
 * trusted-proxies configured, every rule is stored, listed and displayed while
 * enforcing nothing. This banner makes that state impossible to miss, and hands
 * over the exact config line that fixes it.
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
      <Banner tone="warning" icon={<TriangleAlert size={16} aria-hidden="true" />}>
        <p className="font-medium">{t("ip_access.banner_no_storage_title")}</p>
        <p className="mt-0.5 text-sm opacity-90">{t("ip_access.banner_no_storage_body")}</p>
      </Banner>
    );
  }

  if (!status.trusted) {
    return (
      <Banner tone="danger" icon={<ShieldAlert size={16} aria-hidden="true" />}>
        <p className="font-medium">{t("ip_access.banner_untrusted_title")}</p>
        <p className="mt-0.5 text-sm opacity-90">
          {t("ip_access.banner_untrusted_body", {
            ip: status.client_ip || "-",
            header: status.relay_header || "-",
          })}
        </p>
        {configLine ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-black/5 px-2 py-1 font-mono text-xs dark:bg-white/10">
              {configLine}
            </code>
            <button
              type="button"
              onClick={copySuggestion}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {copied ? t("ip_access.copied") : t("ip_access.copy_config")}
            </button>
          </div>
        ) : null}
      </Banner>
    );
  }

  if (status.lockdown) {
    return (
      <Banner tone="info" icon={<ShieldCheck size={16} aria-hidden="true" />}>
        <p className="font-medium">{t("ip_access.banner_lockdown_title")}</p>
        <p className="mt-0.5 text-sm opacity-90">
          {t("ip_access.banner_lockdown_body", { count: status.active_rules })}
        </p>
      </Banner>
    );
  }

  if (status.dropped_events && status.dropped_events > 0) {
    return (
      <Banner tone="warning" icon={<TriangleAlert size={16} aria-hidden="true" />}>
        <p className="font-medium">{t("ip_access.banner_dropped_title")}</p>
        <p className="mt-0.5 text-sm opacity-90">
          {t("ip_access.banner_dropped_body", { count: status.dropped_events })}
        </p>
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
  info: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200",
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
    <div className={`flex gap-2.5 rounded-2xl border px-4 py-3 text-sm ${TONE_CLASS[tone]}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
