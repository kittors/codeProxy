import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Globe,
  GitBranch,
  CalendarClock,
  MonitorSmartphone,
  KeyRound,
  Server,
} from "@code-proxy/ui/icons";
import { Icon as SatinIcon } from "satin-ui/react";
import { useAuth } from "@app/providers/AuthProvider";
import {
  Card,
  GitHubIcon,
  GitHubRepoLink,
  GITHUB_PANEL_SLUG,
  GITHUB_PANEL_URL,
  GITHUB_PROJECT_SLUG,
  GITHUB_PROJECT_URL,
  iconHueClass,
  useToast,
} from "@code-proxy/ui";
import { SystemUpdateCard } from "@features/online-update";

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
        // 悬停只把投影换成抬起一档的 shadow-lift，不另写一套阴影。
        "group transition-shadow hover:shadow-lift",
        hasCopy || hasExternal ? "pr-11" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          className="sn-btn sn-ghost sn-xs sn-ibtn !absolute right-2.5 top-2.5 !text-ink-3 opacity-100 transition hover:!text-ink sm:opacity-0 sm:group-hover:opacity-100"
          title={t("system_page.copy")}
          aria-label={t("system_page.copy")}
        >
          <span
            className={copied ? "sn-swap sn-swapped" : "sn-swap"}
            data-swapped={copied ? "true" : "false"}
            aria-hidden="true"
          >
            <span className="sn-swap-a">
              <SatinIcon name="copy" size={13} />
            </span>
            <span className="sn-swap-b text-emerald-500">
              <SatinIcon name="check" size={13} />
            </span>
          </span>
        </button>
      ) : null}

      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={13} className="hidden text-ink-3 sm:block" />
        <span className="text-2xs font-medium text-ink-3">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0 overflow-hidden">
        {link ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className={`min-w-0 truncate text-sm font-medium text-ink underline decoration-ink-4 underline-offset-2 hover:decoration-ink-2 ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </a>
        ) : (
          <span
            className={`truncate text-sm font-medium text-ink ${mono ? "font-mono text-xs" : ""}`}
          >
            {value}
          </span>
        )}
        {link ? (
          <ExternalLink size={11} className="hidden shrink-0 text-ink-4 sm:inline" />
        ) : null}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Page
   ═══════════════════════════════════════════════════════════ */

export function SystemPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const apiKeyPortalUrl = `${window.location.origin}/manage/apikey-lookup`;
  const apiKeyUsageUrl = `${window.location.origin}/manage/apikey-usage`;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-selected">
            <Server size={16} className={`text-ink-3 ${iconHueClass(Server)}`} />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">
              {t("system_page.title")}
            </h2>
            <p className="hidden text-xs text-ink-3 sm:block">
              {t("system_page.subtitle")}
            </p>
          </div>
        </div>
        <GitHubRepoLink variant="pill" size="sm" />
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

      <section aria-label={t("system_page.github_section")} className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-3">
          <GitHubIcon size={14} className="text-ink-2" />
          <span>{t("system_page.github_section")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: "backend",
              title: t("system_page.github_backend_repo"),
              slug: GITHUB_PROJECT_SLUG,
              url: GITHUB_PROJECT_URL,
            },
            {
              key: "panel",
              title: t("system_page.github_panel_repo"),
              slug: GITHUB_PANEL_SLUG,
              url: GITHUB_PANEL_URL,
            },
          ].map((repo) => (
            <a
              key={repo.key}
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="cp-edge group flex items-center gap-3.5 rounded-2xl bg-[var(--sn-raised)] px-4 py-3.5 text-left no-underline transition-[box-shadow,background-color,transform] duration-150 ease-[var(--sn-ease-out)] hover:bg-[var(--sn-fill-hover)] hover:shadow-lift active:scale-[0.99]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sn-accent)] text-[var(--sn-on-primary)]">
                <GitHubIcon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-ink-3">{repo.title}</span>
                <span className="mt-0.5 block truncate font-mono text-sm font-semibold text-ink">
                  {repo.slug}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-3">{repo.url}</span>
              </span>
              <SatinIcon
                name="arrow-up-right"
                size={16}
                className="shrink-0 text-ink-3 transition-transform duration-150 ease-[var(--sn-ease-out)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink"
              />
            </a>
          ))}
        </div>
      </section>

      <SystemUpdateCard className="shrink-0" />
    </div>
  );
}
