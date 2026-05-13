import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink } from "lucide-react";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import { AUTH_STORAGE_KEY, MANAGEMENT_API_PREFIX } from "@/lib/constants";
import {
  computeManagementApiBase,
  detectApiBaseFromLocation,
  normalizeApiBase,
} from "@/lib/connection";
import {
  ccSwitchImportConfigsApi,
  normalizeCcSwitchImportConfigs,
} from "@/lib/http/apis/ccswitch-import-configs";
import type { ApiKeyEntry } from "@/lib/http/apis/api-keys";
import {
  buildCcSwitchImportUrl,
  openCcSwitchImportUrl,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  deriveCcSwitchImportSettingsFromConfigList,
  type CcSwitchImportConfigListItem,
} from "@/modules/ccswitch/ccswitchImportConfigList";
import { ccSwitchConfigMatchesApiKeyPermissions } from "@/modules/ccswitch/ccswitchImportCompatibility";
import { normalizeCcSwitchClaudeAuthField } from "@/modules/ccswitch/ccswitchImportSettings";
import { Card } from "@/modules/ui/Card";
import { useToast } from "@/modules/ui/ToastProvider";

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
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { apiBase?: unknown; managementKey?: unknown };
    const apiBase = normalizeApiBase(String(parsed.apiBase ?? ""));
    const managementKey = String(parsed.managementKey ?? "").trim();
    if (!apiBase || !managementKey) return null;
    return { apiBase, managementKey };
  } catch {
    return null;
  }
}

async function fetchQuickImportConfigs(): Promise<CcSwitchImportConfigListItem[]> {
  const auth = readStoredManagementAuth();
  const managementBase = auth
    ? computeManagementApiBase(auth.apiBase)
    : `${detectApiBaseFromLocation()}${MANAGEMENT_API_PREFIX}`;

  try {
    const response = await fetch(`${managementBase}/ccswitch-import-configs`, {
      headers: auth
        ? {
            Authorization: `Bearer ${auth.managementKey}`,
          }
        : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Request failed (${response.status})`);
    }
    const data = (await response.json()) as Record<string, unknown>;
    return normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);
  } catch (err) {
    if (auth) throw err;
    return ccSwitchImportConfigsApi.list();
  }
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

  const managementBase = computeManagementApiBase(auth.apiBase);
  try {
    const response = await fetch(`${managementBase}/api-key-entries`, {
      headers: {
        Authorization: `Bearer ${auth.managementKey}`,
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const entries = normalizeApiKeyEntries(data["api-key-entries"] ?? data.items ?? data);
    return entries.find((entry) => entry.key === key) ?? null;
  } catch {
    return null;
  }
}

function normalizeRoutePath(path: string): string {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function appendRoutePath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedPath) return normalizedBase;
  if (normalizedBase.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
}

function buildSettingsForConfig(
  config: CcSwitchImportConfigListItem,
  configs: readonly CcSwitchImportConfigListItem[],
) {
  const settings = deriveCcSwitchImportSettingsFromConfigList(configs);
  const clientSettings = {
    ...settings[config.clientType],
    endpointPath: config.endpointPath ?? settings[config.clientType].endpointPath,
    usageAutoInterval: config.usageAutoInterval ?? settings[config.clientType].usageAutoInterval,
    defaultModel: config.defaultModel ?? settings[config.clientType].defaultModel,
  };

  if (config.clientType === "claude") {
    return {
      ...settings,
      claude: {
        ...clientSettings,
        apiKeyField: normalizeCcSwitchClaudeAuthField(config.apiKeyField),
      },
    };
  }

  return {
    ...settings,
    [config.clientType]: clientSettings,
  };
}

function QuickImportCard({
  config,
  onSelect,
}: {
  config: CcSwitchImportConfigListItem;
  onSelect: (config: CcSwitchImportConfigListItem) => void;
}) {
  const { t } = useTranslation();
  const clientType = config.clientType as "codex" | "claude";

  return (
    <button
      type="button"
      onClick={() => onSelect(config)}
      className="group flex min-h-[116px] w-full items-start gap-4 rounded-2xl border border-black/[0.06] bg-white p-4 text-left shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] transition hover:border-slate-200 hover:shadow-sm active:translate-y-px dark:border-white/[0.06] dark:bg-neutral-900 dark:hover:border-neutral-700"
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
  );
}

export function QuickImportTabContent({
  apiKey,
  reloadToken = 0,
}: {
  apiKey: string;
  reloadToken?: number;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [configs, setConfigs] = useState<CcSwitchImportConfigListItem[]>([]);
  const [apiKeyEntry, setApiKeyEntry] = useState<ApiKeyEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchQuickImportConfigs(), fetchQuickImportApiKeyEntry(apiKey)])
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

  const handleImport = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      const key = apiKey.trim();
      if (!key) return;

      const baseUrl = appendRoutePath(detectApiBaseFromLocation(), config.routePath);
      const url = buildCcSwitchImportUrl({
        apiKey: key,
        baseUrl,
        clientType: config.clientType,
        enabled: true,
        providerName: config.providerName || "CliProxy",
        model: config.defaultModel,
        modelMappings: config.modelMappings,
        models: [],
        settings: buildSettingsForConfig(config, configs),
      });

      openCcSwitchImportUrl(url, {
        onProtocolUnavailable: () =>
          notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
      });
    },
    [apiKey, configs, notify, t],
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

      <Card
        padding="none"
        className="overflow-hidden"
        loading={loading}
      >
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{label}</h3>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-500 dark:bg-neutral-900 dark:text-white/45">
                    {items.length}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {items.map((config) => (
                    <QuickImportCard key={config.id} config={config} onSelect={handleImport} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
