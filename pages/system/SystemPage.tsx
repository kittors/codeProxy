import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  GitBranch,
  CalendarClock,
  MonitorSmartphone,
  KeyRound,
  Server,
} from "lucide-react";
import { useAuth } from "@app/providers/AuthProvider";
import { Card } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { UpdateDetailsCard } from "@app/update/UpdateDetailsCard";

/* ═══════════════════════════════════════════════════════════
   InfoCard — compact grid card with icon
   ═══════════════════════════════════════════════════════════ */

function InfoCard({
  icon: Icon,
  label,
  value,
  mono = false,
  copyable = false,
  link = false,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  link?: boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    notify({ type: "success", message: t("system_page.copied"), duration: 1200 });
  };

  const hasCopy = copyable && value && value !== "--";
  const hasExternal = link && value && value !== "--";

  return (
    <Card
      padding="compact"
      bodyClassName="mt-0"
      className={[
        "group transition hover:shadow-[2px_2px_8px_rgb(0_0_0_/_0.06)] dark:hover:shadow-[2px_2px_8px_rgb(0_0_0_/_0.24)]",
        hasCopy || hasExternal ? "pr-11" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-neutral-800 dark:hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          title={t("system_page.copy")}
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
        </button>
      ) : null}

      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className="hidden text-slate-400 dark:text-white/35 sm:block" />
        <span className="text-2xs font-semibold uppercase tracking-widest text-slate-400 dark:text-white/35">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-w-0 truncate text-sm font-medium text-indigo-600 underline decoration-indigo-300/40 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400 dark:decoration-indigo-500/30 ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </a>
        ) : (
          <span
            className={`truncate text-sm font-medium text-slate-800 dark:text-white ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </span>
        )}
        {link ? (
          <ExternalLink size={11} className="hidden shrink-0 text-indigo-400/50 sm:inline" />
        ) : null}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

export function SystemPage({
  updateHeartbeatIntervalMs,
  updateHeartbeatTimeoutMs,
}: {
  updateHeartbeatIntervalMs?: number;
  updateHeartbeatTimeoutMs?: number;
} = {}) {
  const { t } = useTranslation();
  const auth = useAuth();
  const apiKeyPortalUrl = `${window.location.origin}/manage/apikey-lookup`;
  const apiKeyUsageUrl = `${window.location.origin}/manage/apikey-usage`;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Server size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("system_page.title")}
            </h2>
            <p className="hidden text-xs text-slate-500 dark:text-white/45 sm:block">
              {t("system_page.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <InfoCard
          icon={Globe}
          label={t("system_page.api_base")}
          value={auth.state.apiBase || "--"}
          mono
          copyable
        />
        <InfoCard
          icon={Globe}
          label={t("system_page.mgmt_endpoint")}
          value={auth.meta.managementEndpoint || "--"}
          mono
          copyable
        />
        <InfoCard
          icon={GitBranch}
          label={t("system_page.version")}
          value={auth.state.serverVersion ?? "--"}
        />
        <InfoCard
          icon={CalendarClock}
          label={t("system_page.build_time")}
          value={auth.state.serverBuildDate ?? "--"}
          mono
        />
        <InfoCard
          icon={MonitorSmartphone}
          label={t("system_page.ui_version")}
          value={__APP_VERSION__ || "--"}
        />
        <InfoCard
          icon={KeyRound}
          label={t("system_page.api_key_portal")}
          value={apiKeyPortalUrl}
          link
        />
        <InfoCard
          icon={KeyRound}
          label={t("system_page.api_key_usage")}
          value={apiKeyUsageUrl}
          link
        />
      </div>

      <UpdateDetailsCard
        heartbeatIntervalMs={updateHeartbeatIntervalMs}
        heartbeatTimeoutMs={updateHeartbeatTimeoutMs}
      />
    </div>
  );
}
