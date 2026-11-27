import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download, ExternalLink, Inbox } from "@code-proxy/ui/icons";
import { detectApiBaseFromLocation, publicApiClient } from "@code-proxy/api-client";
import {
  normalizeCcSwitchImportConfigs,
  serializeCcSwitchImportConfig,
} from "@code-proxy/api-client/endpoints/ccswitch-import-configs";
import { openCcSwitchImportUrl } from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLIENT_TYPES,
  getCcSwitchClientConfig,
} from "@code-proxy/domain/ccswitch/ccswitchClients";
import { buildCcSwitchImportUrlForConfig } from "@code-proxy/domain/ccswitch/ccswitchImportLinks";
import type { CcSwitchImportConfigListItem } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { CcSwitchClientIcon, getPrimaryModel } from "@features/ccswitch-import";
import {
  getActiveCacheTenantId,
  readTenantBucketMapEntry,
  updateTenantBucketMapEntry,
} from "@code-proxy/domain";
import { Button, surface } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { copyTextToClipboard } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";

const CC_SWITCH_RELEASES_URL = "https://github.com/farion1231/cc-switch/releases";
/** Placeholder groups shown while the presets load. */
const SKELETON_GROUPS = ["first", "second"];
/**
 * Tenant-scoped quick-import cache (v3).
 * Lookup always loads presets via the public endpoint keyed by API key, so residual
 * management-session auth must not influence cache identity or filtering.
 * Legacy v1/v2 buckets are not reused (different shape / wrong tenant mixing).
 */
const QUICK_IMPORT_CACHE_STORAGE_KEY = "apiKeyLookup.quickImportCache.v3";

/** 中性小标签：只有淡底、不描边。 */
const NEUTRAL_TAG = "bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * The backend row shape, plus what the Codex link needs offline: the reasoning efforts and
 * the context window (kept whatever the backend supports — the cache never goes back to it).
 */
function serializeQuickImportConfig(config: CcSwitchImportConfigListItem): Record<string, unknown> {
  return {
    ...serializeCcSwitchImportConfig(config, { codexContextWindow: true }),
    ...(config.codexReasoningEfforts ? { codexReasoningEfforts: config.codexReasoningEfforts } : {}),
  };
}

function getQuickImportCacheKey(apiKey: string): string {
  // Public lookup is scoped by the entered API key only (server resolves tenant).
  return apiKey.trim();
}

type QuickImportCacheEntry = {
  configs: CcSwitchImportConfigListItem[];
};

function parseQuickImportCacheEntry(value: unknown): QuickImportCacheEntry | null {
  if (!isRecord(value)) return null;
  const configs = normalizeCcSwitchImportConfigs(value.configs);
  return { configs };
}

function readStoredQuickImportCache(cacheKey: string): QuickImportCacheEntry | null {
  if (!cacheKey) return null;
  const raw = readTenantBucketMapEntry({
    key: QUICK_IMPORT_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
  });
  return parseQuickImportCacheEntry(raw);
}

function writeStoredQuickImportCache(cacheKey: string, value: QuickImportCacheEntry): void {
  if (!cacheKey) return;
  updateTenantBucketMapEntry({
    key: QUICK_IMPORT_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    entryValue: {
      configs: value.configs.map(serializeQuickImportConfig),
    },
    maxEntries: 8,
  });
}

const sameJsonValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * Always use the public endpoint for API-key lookup.
 * Residual admin auth in localStorage must not switch this to management GET,
 * which is tenant-scoped by the admin session and can return the wrong tenant's
 * presets (or none) for the looked-up key.
 */
async function fetchQuickImportConfigs(apiKey: string): Promise<CcSwitchImportConfigListItem[]> {
  const key = apiKey.trim();
  if (!key) return [];

  const data = await publicApiClient.post<Record<string, unknown>>("/ccswitch-import-configs", {
    api_key: key,
  });
  return normalizeCcSwitchImportConfigs(data["ccswitch-import-configs"] ?? data.items ?? data);
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
  const clientType = config.clientType;

  return (
    <div
      className={[
        surface({ radius: "2xl" }),
        "sn-fade-up group/card grid min-h-[116px] w-full grid-cols-[minmax(0,1fr)_auto] transition-shadow hover:shadow-sn-lift",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSelect(config)}
        className="flex min-w-0 items-start gap-3 rounded-l-2xl p-4 text-left transition active:translate-y-px"
      >
        {/* 客户端 logo 直接放在标题前，不再垫一块描边小方块（卡片角落里的框中框）。 */}
        <CcSwitchClientIcon clientType={clientType} className="mt-0.5 h-5 w-5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-sn-label">
              {config.providerName}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-2xs font-semibold ${NEUTRAL_TAG}`}>
              {t(getCcSwitchClientConfig(clientType).labelKey)}
            </span>
          </span>
          {config.note ? (
            <span className="mt-1 block truncate text-xs text-sn-label3">
              {config.note}
            </span>
          ) : null}
          <span className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex max-w-full overflow-hidden rounded-md px-1.5 py-0.5 font-mono text-2xs text-ellipsis whitespace-nowrap ${NEUTRAL_TAG}`}
            >
              {getPrimaryModel(config) || t("common.no_model_data")}
            </span>
            {config.allowedChannelGroups.length > 0 ? (
              <span className="truncate text-2xs text-sn-label3">
                {config.allowedChannelGroups.join(", ")}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <div className="pointer-events-none relative z-10 flex items-start gap-1 p-3 pl-0 opacity-0 transition-opacity group-hover/card:pointer-events-auto group-hover/card:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
        <Button
          variant="ghost"
          size="xs"
          title={copied ? t("ccswitch.copy_import_link_copied") : t("ccswitch.copy_import_link")}
          onClick={() => onCopyLink(config)}
          className="text-sn-label2 hover:text-sn-label"
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
    // 与加载完成后的版面一致：分组直接落在页面上，每一项是一张卡片。
    <div>
      <div
        data-testid="quick-import-loading-skeleton"
        aria-busy="true"
        aria-label={t("common.loading_ellipsis")}
        className="space-y-5"
      >
        {SKELETON_GROUPS.map((group) => (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
              <span className="h-4 w-24 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
              <span className="h-5 w-8 rounded-full bg-sn-sunken motion-safe:animate-pulse" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className={`${surface({ radius: "2xl" })} flex min-h-[116px] items-start gap-4 p-4`}
                >
                  <span className="h-5 w-5 shrink-0 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
                  <span className="min-w-0 flex-1 space-y-3 pt-0.5">
                    <span className="block h-4 w-1/2 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
                    <span className="block h-3 w-2/3 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
                    <span className="flex gap-2 pt-1">
                      <span className="h-5 w-24 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
                      <span className="h-5 w-16 rounded-md bg-sn-sunken motion-safe:animate-pulse" />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
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
  const cacheKey = useMemo(() => getQuickImportCacheKey(apiKey), [apiKey]);
  const initialCache = useMemo(() => readStoredQuickImportCache(cacheKey), [cacheKey]);
  const [configs, setConfigs] = useState<CcSwitchImportConfigListItem[]>(
    () => initialCache?.configs ?? [],
  );
  const [loading, setLoading] = useState(!initialCache);
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
    const cached = readStoredQuickImportCache(cacheKey);
    if (cached) {
      setConfigs((prev) => (sameJsonValue(prev, cached.configs) ? prev : cached.configs));
    }
    setLoading(!cached);
    setError(null);

    fetchQuickImportConfigs(apiKey)
      .then((items) => {
        if (cancelled) return;
        // The public endpoint already filters by the key's permissions; every app the
        // panel knows gets its cards (the normalizer drops apps it does not).
        const nextConfigs = items;
        writeStoredQuickImportCache(cacheKey, { configs: nextConfigs });
        setConfigs((prev) => (sameJsonValue(prev, nextConfigs) ? prev : nextConfigs));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!cached) {
          setConfigs([]);
        }
        setError(err instanceof Error ? err.message : t("apikey_lookup.quick_import_load_failed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, cacheKey, reloadToken, t]);

  // One group per app, in the panel's app order; apps without presets are left out.
  const groupedConfigs = useMemo(
    () =>
      CC_SWITCH_CLIENT_TYPES.map((clientType) => ({
        clientType,
        items: configs.filter((config) => config.clientType === clientType),
      })).filter((group) => group.items.length > 0),
    [configs],
  );

  const visibleCount = configs.length;

  const buildImportUrl = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      const key = apiKey.trim();
      if (!key) return "";

      // The link's usage query runs against the root: the preset's route path does not
      // serve /v0/management/*.
      return buildCcSwitchImportUrlForConfig({
        apiKey: key,
        baseUrl: detectApiBaseFromLocation(),
        config,
        usageLanguage: i18n.language,
      });
    },
    [apiKey, i18n.language],
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

  const showSkeleton = loading && configs.length === 0;
  const showEmpty = !showSkeleton && !error && visibleCount === 0;

  return (
    <div className="space-y-4">
      <Card padding="compact">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {/* 线性图标跟在标题前，不再垫一块反色的图标方块（卡片角落里的又一层）。 */}
          <div className="flex items-start gap-2.5">
            <Download size={16} className="mt-0.5 shrink-0 text-sn-label3" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-sn-label">
                {t("apikey_lookup.quick_import_setup_title")}
              </h3>
              <p className="max-w-3xl text-xs leading-5 text-sn-label2">
                {t("apikey_lookup.quick_import_setup_desc")}
              </p>
            </div>
          </div>
          <a
            href={CC_SWITCH_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sn-raised px-3 text-xs font-semibold text-sn-label border border-sn-line-control transition-[background-color,box-shadow] hover:bg-sn-hover-solid hover:border-sn-line-control-hover focus-visible:border-sn-focus focus-visible:shadow-[0_0_0_3px_var(--sn-ring)]"
          >
            {t("apikey_lookup.quick_import_download_latest")}
            <ExternalLink size={13} />
          </a>
        </div>
      </Card>

      {showSkeleton ? <QuickImportLoadingSkeleton /> : null}

      {error ? (
        <div className="rounded-xl bg-rose-500/10 px-5 py-2.5 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {showEmpty ? (
        <EmptyState
          icon={<Inbox size={28} className="opacity-50" />}
          title={t("apikey_lookup.quick_import_empty_title")}
          description={t("apikey_lookup.quick_import_empty_desc")}
        />
      ) : null}

      {!showSkeleton && !showEmpty && visibleCount > 0 ? (
        // 分组直接落在页面上：以前外面再包一张大卡，里面的每一项又是一张描边卡片。
        <div>
          <div className="space-y-5">
            {groupedConfigs.map(({ clientType, items }) => {
              const label = t(getCcSwitchClientConfig(clientType).labelKey);

              return (
                <section
                  key={clientType}
                  aria-label={t("apikey_lookup.quick_import_group_aria", { client: label })}
                  className="sn-fade-up space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <CcSwitchClientIcon clientType={clientType} />
                    <h3 className="text-sm font-semibold text-sn-label">{label}</h3>
                    <span
                      key={`${clientType}-${items.length}`}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${NEUTRAL_TAG}`}
                    >
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
        </div>
      ) : null}
    </div>
  );
}
