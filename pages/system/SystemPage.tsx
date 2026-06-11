import { useCallback, useEffect, useMemo, useState } from "react";
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
  RefreshCw,
  Search,
  Server,
  Layers,
  CircleAlert,
} from "lucide-react";
import { useAuth } from "@app/providers/AuthProvider";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { UpdateDetailsCard } from "@app/update/UpdateDetailsCard";
import {
  loadConfiguredModelAvailability,
  loadModelPathAvailability,
} from "@features/model-availability";
import {
  buildModelVendorStats,
  CopyableModelTag,
  ModelVendorStatBadge,
} from "@features/model-tags";
import { HoverTooltip } from "@code-proxy/ui";

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
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/35">
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

const _AUTO_REFRESH_INTERVAL = 30_000;

export function SystemPage({
  updateHeartbeatIntervalMs,
  updateHeartbeatTimeoutMs,
}: {
  updateHeartbeatIntervalMs?: number;
  updateHeartbeatTimeoutMs?: number;
} = {}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useAuth();

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const [configuredAvailability, pathAvailability] = await Promise.all([
        loadConfiguredModelAvailability().catch(() => null),
        loadModelPathAvailability().catch(() => null),
      ]);

      const useMappedOwnerModels = configuredAvailability?.usesMappedOwners === true;
      const rootV1ModelIds =
        pathAvailability?.items
          .filter((item) =>
            item.paths.some(
              (path) => path.scope === "root" && path.method === "GET" && path.path === "/v1/models",
            ),
          )
          .map((item) => item.id) ?? [];
      const nextModelIds = useMappedOwnerModels
        ? (configuredAvailability?.items ?? []).map((item) => item.id)
        : rootV1ModelIds.length > 0
          ? rootV1ModelIds
          : (configuredAvailability?.items ?? []).map((item) => item.id);

      setModels(Array.from(new Set(nextModelIds)).sort((a, b) => a.localeCompare(b)));
    } catch (err: unknown) {
      setModelsError(err instanceof Error ? err.message : t("system_page.load_failed"));
    } finally {
      setModelsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const filteredModels = useMemo(() => {
    const needle = modelFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((id) => id.toLowerCase().includes(needle));
  }, [modelFilter, models]);

  const vendorStats = useMemo(() => {
    return buildModelVendorStats(models, t("common.other"));
  }, [models, t]);

  const handleModelCopied = useCallback(() => {
    notify({ type: "success", message: t("system_page.copied"), duration: 1200 });
  }, [notify, t]);

  const apiKeyLookupUrl = `${window.location.origin}/manage/apikey-lookup`;

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      {/* ── Header ── */}
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

      {/* ── Connection & Version Grid ── */}
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
          label={t("system_page.api_key_lookup")}
          value={apiKeyLookupUrl}
          link
        />
      </div>

      <UpdateDetailsCard
        heartbeatIntervalMs={updateHeartbeatIntervalMs}
        heartbeatTimeoutMs={updateHeartbeatTimeoutMs}
      />

      {/* ── Model List ── */}
      <Card padding="none" className="overflow-hidden" bodyClassName="mt-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Layers size={15} className="text-slate-500 dark:text-white/40" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("system_page.available_models")}
            </h3>
            <HoverTooltip content={t("system_page.available_models_tooltip")} placement="bottom">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-500 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10">
                <CircleAlert size={14} aria-hidden="true" />
              </span>
            </HoverTooltip>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              {filteredModels.length}
            </span>
            {modelFilter && filteredModels.length !== models.length && (
              <span className="text-[10px] text-slate-400 dark:text-white/30">
                / {models.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              placeholder={t("system_page.search_models")}
              className="!w-32 sm:!w-48"
              startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              <RefreshCw size={13} className={modelsLoading ? "animate-spin" : ""} />
              {t("system_page.refresh")}
            </Button>
          </div>
        </div>

        {/* Vendor stats bar */}
        {vendorStats.length > 0 && !modelsLoading && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-neutral-800/60">
            {vendorStats.map((stat) => (
              <ModelVendorStatBadge
                key={stat.key}
                vendorKey={stat.key}
                label={stat.label}
                count={stat.count}
              />
            ))}
          </div>
        )}

        {/* Error */}
        {modelsError && (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {modelsError}
          </div>
        )}

        {/* Model tags */}
        <div className="max-h-[480px] overflow-y-auto px-5 py-4">
          {modelsLoading && models.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-white/50">
              <RefreshCw size={14} className="animate-spin mr-2" />
              {t("system_page.loading_models")}
            </div>
          ) : filteredModels.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {filteredModels.map((id) => (
                <CopyableModelTag
                  key={id}
                  id={id}
                  title={t("system_page.click_copy")}
                  copiedLabel={t("system_page.copied")}
                  onCopied={handleModelCopied}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-white/30">
              <Layers size={28} className="mb-2 opacity-40" />
              <p className="text-sm">
                {models.length === 0 ? t("system_page.no_models") : t("system_page.no_match")}
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
