import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import {
  ApiClient,
  detectApiBaseFromLocation,
  publicApiClient,
  readPersistedAuthSnapshot,
} from "@code-proxy/api-client";
import {
  ccSwitchImportConfigsApi,
  normalizeCcSwitchImportConfigs,
} from "@code-proxy/api-client/endpoints/ccswitch-import-configs";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import {
  openCcSwitchImportUrl,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  appendCcSwitchRoutePath,
  buildCcSwitchImportUrlForConfig,
} from "@code-proxy/domain/ccswitch/ccswitchImportLinks";
import type { CcSwitchImportConfigListItem } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { ccSwitchConfigMatchesApiKeyPermissions } from "@code-proxy/domain/ccswitch/ccswitchImportCompatibility";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { copyTextToClipboard } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";

const CC_SWITCH_RELEASES_URL = "https://github.com/farion1231/cc-switch/releases";
const QUICK_IMPORT_CLIENTS: CcSwitchClientType[] = ["codex", "claude"];

const iconByType: Record<"codex" | "claude", string> = {
  codex: iconCodex,
  claude: iconClaude,
};

const clientLabelKey: Record<"codex" | "claude", string> = {
  codex: "apikey_lookup.quick_import_codex",
  claude: "apikey_lookup.quick_import_claude",
};

function readStoredManagementAuth(): { apiBase: string; managementKey: string } | null {
  const snapshot = readPersistedAuthSnapshot();
  if (!snapshot?.apiBase || !snapshot.managementKey) return null;
  return { apiBase: snapshot.apiBase, managementKey: snapshot.managementKey };
}

async function fetchPublicQuickImportConfigs(
  apiKey: string,
): Promise<CcSwitchImportConfigListItem[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const data = await publicApiClient.post<Record<string, unknown>>("/ccswitch-import-configs", {
    api_key: key,
  });
  return normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);
}

async function fetchQuickImportConfigs(apiKey: string): Promise<CcSwitchImportConfigListItem[]> {
  const auth = readStoredManagementAuth();
  if (!auth) {
    try {
      return await fetchPublicQuickImportConfigs(apiKey);
    } catch {
      // Backward compatible fallback for older servers that don't have the public endpoint yet.
      return ccSwitchImportConfigsApi.list();
    }
  }

  const client = new ApiClient();
  client.setConfig(auth);
  const data = await client.get<Record<string, unknown>>("/ccswitch-import-configs");
  return normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);
}

function normalizeApiKeyEntries(raw: unknown): ApiKeyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ApiKeyEntry =>
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as { key?: unknown }).key === "string",
  );
}

async function fetchQuickImportApiKeyEntry(apiKey: string): Promise<ApiKeyEntry | null> {
  const auth = readStoredManagementAuth();
  if (!auth) return null;

  const key = apiKey.trim();
  if (!key) return null;

  try {
    const client = new ApiClient();
    client.setConfig(auth);
    const data = await client.get<Record<string, unknown>>("/api-key-entries");
    const entries = normalizeApiKeyEntries(data["api-key-entries"] ?? data.items ?? data);
    return entries.find((entry) => entry.key === key) ?? null;
  } catch {
    return null;
  }
}

function QuickImportCard({
  config,
  copied,
  onCopyLink,
  onSelect,
}: {
  config: CcSwitchImportConfigListItem;
  copied: boolean;
  onCopyLink: (config: CcSwitchImportConfigListItem) => void;
  onSelect: (config: CcSwitchImportConfigListItem) => void;
}) {
  const { t } = useTranslation();
  const clientType = config.clientType as "codex" | "claude";

  return (
    <div className="grid min-h-[116px] w-full grid-cols-[minmax(0,1fr)_auto] rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] transition hover:border-slate-200 hover:shadow-sm dark:border-white/[0.06] dark:bg-neutral-900 dark:hover:border-neutral-700">
      <button
        type="button"
        onClick={() => onSelect(config)}
        className="flex min-w-0 items-start gap-4 rounded-l-2xl p-4 text-left transition active:translate-y-px"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
          <img src={iconByType[clientType]} alt="" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {config.providerName}
            </span>
            <span className="rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/45">
              {t(clientLabelKey[clientType])}
            </span>
          </span>
          {config.note ? (
            <span className="mt-1 block truncate text-xs text-slate-500 dark:text-white/55">
              {config.note}
            </span>
          ) : null}
          <span className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200/70 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/45">
              {config.defaultModel || t("common.no_model_data")}
            </span>
            {config.allowedChannelGroups.length > 0 ? (
              <span className="truncate text-[10px] text-slate-400 dark:text-white/35">
                {config.allowedChannelGroups.join(", ")}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <div className="flex items-start p-3 pl-0">
        <Button
          variant="ghost"
          size="xs"
          title={copied ? t("ccswitch.copy_import_link_copied") : t("ccswitch.copy_import_link")}
          onClick={() => onCopyLink(config)}
          className="rounded-lg border border-slate-200/70 bg-white text-slate-500 hover:text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/55 dark:hover:text-white"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
      </div>
    </div>
  );
}

function QuickImportLoadingSkeleton() {
  const { t } = useTranslation();

  return (
    <Card
      padding="none"
      className="overflow-hidden border-slate-200/70 bg-white/90 dark:border-white/[0.06] dark:bg-neutral-950/70"
    >
      <div
        data-testid="quick-import-loading-skeleton"
        aria-busy="true"
        aria-label={t("common.loading_ellipsis")}
        className="space-y-5 px-5 py-4"
      >
        {QUICK_IMPORT_CLIENTS.map((clientType) => (
          <section key={clientType} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-md bg-slate-200 motion-safe:animate-pulse dark:bg-neutral-800" />
              <span className="h-4 w-24 rounded-md bg-slate-200 motion-safe:animate-pulse dark:bg-neutral-800" />
              <span className="h-5 w-8 rounded-full bg-slate-100 motion-safe:animate-pulse dark:bg-neutral-900" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex min-h-[116px] items-start gap-4 rounded-2xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-900"
                >
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-neutral-800" />
                  <span className="min-w-0 flex-1 space-y-3 pt-0.5">
                    <span className="block h-4 w-1/2 rounded-md bg-slate-200 motion-safe:animate-pulse dark:bg-neutral-800" />
                    <span className="block h-3 w-2/3 rounded-md bg-slate-100 motion-safe:animate-pulse dark:bg-neutral-900" />
                    <span className="flex gap-2 pt-1">
                      <span className="h-5 w-24 rounded-md bg-slate-100 motion-safe:animate-pulse dark:bg-neutral-900" />
                      <span className="h-5 w-16 rounded-md bg-slate-100 motion-safe:animate-pulse dark:bg-neutral-900" />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

export function QuickImportTabContent({
  apiKey,
  reloadToken = 0,
}: {
  apiKey: string;
  reloadToken?: number;
}) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [configs, setConfigs] = useState<CcSwitchImportConfigListItem[]>([]);
  const [apiKeyEntry, setApiKeyEntry] = useState<ApiKeyEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedImportConfigId, setCopiedImportConfigId] = useState<string | null>(null);
  const copiedImportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCopiedImportState = useCallback((configId: string) => {
    setCopiedImportConfigId(configId);
    if (copiedImportTimerRef.current) {
      clearTimeout(copiedImportTimerRef.current);
    }
    copiedImportTimerRef.current = setTimeout(() => {
      setCopiedImportConfigId(null);
      copiedImportTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(
    () => () => {
      if (copiedImportTimerRef.current) {
        clearTimeout(copiedImportTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchQuickImportConfigs(apiKey), fetchQuickImportApiKeyEntry(apiKey)])
      .then(([items, entry]) => {
        if (cancelled) return;
        setConfigs(items.filter((item) => QUICK_IMPORT_CLIENTS.includes(item.clientType)));
        setApiKeyEntry(entry);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConfigs([]);
        setApiKeyEntry(null);
        setError(err instanceof Error ? err.message : t("apikey_lookup.quick_import_load_failed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, reloadToken, t]);

  const groupedConfigs = useMemo(
    () => ({
      codex: configs.filter(
        (config) =>
          config.clientType === "codex" &&
          ccSwitchConfigMatchesApiKeyPermissions(config, apiKeyEntry),
      ),
      claude: configs.filter(
        (config) =>
          config.clientType === "claude" &&
          ccSwitchConfigMatchesApiKeyPermissions(config, apiKeyEntry),
      ),
    }),
    [apiKeyEntry, configs],
  );

  const buildImportUrl = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      const key = apiKey.trim();
      if (!key) return "";

      const baseUrl = appendCcSwitchRoutePath(detectApiBaseFromLocation(), config.routePath);
      // Use root base URL for usage queries so that usage/summary is not
      // routed through the CC Switch routePath (which the server does not rewrite for /v0/management/* paths).
      const usageBaseUrl = detectApiBaseFromLocation();
      return buildCcSwitchImportUrlForConfig({
        apiKey: key,
        baseUrl,
        config,
        configs,
        usageBaseUrl,
        usageLanguage: i18n.language,
      });
    },
    [apiKey, configs, i18n.language],
  );

  const handleImport = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      const url = buildImportUrl(config);
      if (!url) return;

      openCcSwitchImportUrl(url, {
        onProtocolUnavailable: () =>
          notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
      });
    },
    [buildImportUrl, notify, t],
  );

  const handleCopyImportLink = useCallback(
    async (config: CcSwitchImportConfigListItem) => {
      const url = buildImportUrl(config);
      if (!url) return;

      if (await copyTextToClipboard(url)) {
        showCopiedImportState(config.id);
        notify({ type: "success", message: t("ccswitch.copy_import_link_success") });
        return;
      }
      notify({ type: "error", message: t("ccswitch.copy_import_link_failed") });
    },
    [buildImportUrl, notify, showCopiedImportState, t],
  );

  return (
    <div className="space-y-4">
      <Card padding="compact" className="border-slate-200/70 bg-white/85 dark:bg-neutral-950/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-neutral-950">
              <Download size={16} />
            </span>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("apikey_lookup.quick_import_setup_title")}
              </h3>
              <p className="max-w-3xl text-xs leading-5 text-slate-600 dark:text-white/65">
                {t("apikey_lookup.quick_import_setup_desc")}
              </p>
            </div>
          </div>
          <a
            href={CC_SWITCH_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/80 dark:hover:bg-white/10"
          >
            {t("apikey_lookup.quick_import_download_latest")}
            <ExternalLink size={13} />
          </a>
        </div>
      </Card>

      {loading ? <QuickImportLoadingSkeleton /> : null}

      {!loading ? (
        <Card padding="none" className="overflow-hidden">
          {error ? (
            <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          ) : null}
          <div className="space-y-5 px-5 py-4">
            {QUICK_IMPORT_CLIENTS.map((clientType) => {
              const typedClient = clientType as "codex" | "claude";
              const items = groupedConfigs[typedClient];
              const label = t(clientLabelKey[typedClient]);

              if (items.length === 0) return null;

              return (
                <section
                  key={typedClient}
                  aria-label={t("apikey_lookup.quick_import_group_aria", { client: label })}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <img src={iconByType[typedClient]} alt="" className="h-4 w-4" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {label}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500 dark:bg-neutral-900 dark:text-white/45">
                      {items.length}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {items.map((config) => (
                      <QuickImportCard
                        key={config.id}
                        config={config}
                        copied={copiedImportConfigId === config.id}
                        onCopyLink={(item) => void handleCopyImportLink(item)}
                        onSelect={handleImport}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
