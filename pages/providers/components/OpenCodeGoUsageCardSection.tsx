import { useEffect, useState } from "react";
import { Gauge, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OpenCodeGoUsageItem } from "@code-proxy/api-client";
import { QuotaBar } from "@features/quota-preview/QuotaBar";

export interface OpenCodeGoUsageCacheEntry {
  sourceId?: string;
  workspaceId?: string;
  usage: OpenCodeGoUsageItem[];
  updatedAt: number;
  error?: string;
}

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, value));

type OpenCodeGoUsageState = Record<string, OpenCodeGoUsageCacheEntry>;
type OpenCodeGoUsageSnapshot = {
  usageEntry?: OpenCodeGoUsageCacheEntry;
  loading: boolean;
};
type OpenCodeGoUsageListener = () => void;

export interface OpenCodeGoUsageStore {
  getSnapshot: (cacheKey: string) => OpenCodeGoUsageSnapshot;
  subscribe: (
    cacheKey: string,
    listener: OpenCodeGoUsageListener,
  ) => () => void;
  setLoading: (cacheKey: string, loading: boolean) => void;
  updateEntry: (
    cacheKey: string,
    updater: (
      existing: OpenCodeGoUsageCacheEntry | undefined,
    ) => OpenCodeGoUsageCacheEntry,
  ) => void;
  prune: (validKeys: Set<string>) => void;
}

export function createOpenCodeGoUsageStore(
  initialEntries: OpenCodeGoUsageState,
  onChange: (entries: OpenCodeGoUsageState) => void,
): OpenCodeGoUsageStore {
  let entries = initialEntries;
  const loadingState: Record<string, boolean> = {};
  const listeners = new Map<string, Set<OpenCodeGoUsageListener>>();

  const emit = (cacheKey: string) => {
    listeners.get(cacheKey)?.forEach((listener) => listener());
  };

  const setEntries = (next: OpenCodeGoUsageState, changedKeys: string[]) => {
    entries = next;
    onChange(entries);
    changedKeys.forEach(emit);
  };

  return {
    getSnapshot: (cacheKey) => ({
      usageEntry: entries[cacheKey],
      loading: loadingState[cacheKey] ?? false,
    }),
    subscribe: (cacheKey, listener) => {
      const keyListeners = listeners.get(cacheKey) ?? new Set();
      keyListeners.add(listener);
      listeners.set(cacheKey, keyListeners);
      return () => {
        keyListeners.delete(listener);
        if (keyListeners.size === 0) listeners.delete(cacheKey);
      };
    },
    setLoading: (cacheKey, loading) => {
      if ((loadingState[cacheKey] ?? false) === loading) return;
      loadingState[cacheKey] = loading;
      emit(cacheKey);
    },
    updateEntry: (cacheKey, updater) => {
      const nextEntry = updater(entries[cacheKey]);
      setEntries({ ...entries, [cacheKey]: nextEntry }, [cacheKey]);
    },
    prune: (validKeys) => {
      const staleKeys = Object.keys(entries).filter(
        (key) => !validKeys.has(key),
      );
      if (staleKeys.length === 0) return;
      const next = { ...entries };
      staleKeys.forEach((key) => {
        delete next[key];
        delete loadingState[key];
      });
      setEntries(next, staleKeys);
    },
  };
}

export function useOpenCodeGoUsageSnapshot(
  store: OpenCodeGoUsageStore,
  cacheKey: string,
  includeLoading = true,
): OpenCodeGoUsageSnapshot {
  const readSnapshot = () => {
    const snapshot = store.getSnapshot(cacheKey);
    return includeLoading ? snapshot : { ...snapshot, loading: false };
  };
  const [snapshot, setSnapshot] = useState(readSnapshot);

  useEffect(() => {
    const updateSnapshot = () => {
      setSnapshot((previous) => {
        const next = readSnapshot();
        return previous.usageEntry === next.usageEntry &&
          previous.loading === next.loading
          ? previous
          : next;
      });
    };
    updateSnapshot();
    return store.subscribe(cacheKey, () => {
      updateSnapshot();
    });
  }, [cacheKey, includeLoading, store]);

  return snapshot;
}

export function mergeOpenCodeGoUsage(
  existing: OpenCodeGoUsageItem[],
  incoming: OpenCodeGoUsageItem[],
): OpenCodeGoUsageItem[] {
  if (!existing.length) return incoming;
  if (!incoming.length) return existing;

  const seen = new Set<string>();
  const result: OpenCodeGoUsageItem[] = [];

  for (const item of incoming) {
    const key = item.type.toLowerCase();
    seen.add(key);
    result.push(item);
  }

  for (const item of existing) {
    const key = item.type.toLowerCase();
    if (!seen.has(key)) {
      result.push(item);
      seen.add(key);
    }
  }

  return result;
}

const resolveRemainingPercent = (
  usagePercentage: number | undefined,
): number | null => {
  if (typeof usagePercentage !== "number" || !Number.isFinite(usagePercentage))
    return null;
  return clampPercent(100 - clampPercent(usagePercentage));
};

const formatPercent = (value: number): string =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(/\.0$/, "");

const DEFAULT_TYPE_LABELS = ["rolling", "weekly", "monthly"] as const;

const TYPE_COMPACT_LABEL_KEYS: Record<string, string> = {
  rolling: "providers.opencode_go_usage_compact_rolling",
  weekly: "providers.opencode_go_usage_compact_weekly",
  monthly: "providers.opencode_go_usage_compact_monthly",
  five_hour: "providers.opencode_go_usage_compact_five_hour",
  session: "providers.opencode_go_usage_compact_session",
};

const getCompactUsageLabel = (
  type: string,
  usageByType: Map<string, OpenCodeGoUsageItem>,
  t: (key: string) => string,
): string => {
  const normalized = type.toLowerCase();
  if (
    normalized === "rolling" ||
    normalized === "weekly" ||
    normalized === "monthly" ||
    normalized === "five_hour" ||
    normalized === "session"
  ) {
    return t(TYPE_COMPACT_LABEL_KEYS[normalized]);
  }
  return usageByType.get(normalized)?.label || type;
};

const getUsageItemForType = (
  type: string,
  usageByType: Map<string, OpenCodeGoUsageItem>,
): OpenCodeGoUsageItem | undefined => {
  const normalized = type.toLowerCase();
  if (normalized === "rolling") {
    return usageByType.get("rolling") ?? usageByType.get("session");
  }
  if (normalized === "session") {
    return usageByType.get("session") ?? usageByType.get("rolling");
  }
  return usageByType.get(normalized);
};

export function OpenCodeGoUsageCardSection({
  cacheKey,
  usageStore,
  loading,
  queryReady,
  windowTypes = DEFAULT_TYPE_LABELS,
}: {
  cacheKey: string;
  usageStore: OpenCodeGoUsageStore;
  loading?: boolean;
  queryReady: boolean;
  windowTypes?: readonly string[];
}) {
  const { t } = useTranslation();
  const snapshot = useOpenCodeGoUsageSnapshot(usageStore, cacheKey, false);
  const usageEntry = queryReady ? snapshot.usageEntry : undefined;
  const isLoading = queryReady
    ? (loading ?? (snapshot.loading || !snapshot.usageEntry))
    : false;
  const remainingUnknownText = t(
    "providers.opencode_go_usage_remaining_unknown",
  );

  const usageByType = new Map(
    (usageEntry?.usage ?? []).map((item) => [item.type.toLowerCase(), item]),
  );

  const hasUsage = Boolean(usageEntry && usageEntry.usage.length > 0);

  const errorText = usageEntry?.error
    ? usageEntry.error.length > 60
      ? t("providers.channel_usage_query_failed")
      : usageEntry.error
    : null;

  // One state at a time. A failed probe used to render the "not queried" gauge
  // and a red error line together, which read as two unrelated problems.
  // One line, not a stacked icon block: this is a status note on a card that is
  // otherwise two or three lines tall, and a centred 8x8 medallion above a
  // caption made the note the largest thing on it.
  const renderPlaceholder = (message: string, tone: "muted" | "error") => (
    <div
      className={[
        "flex h-6 w-full items-center gap-1.5 rounded-md border px-2 text-xs font-medium",
        tone === "error"
          ? "border-rose-200 bg-rose-50/60 text-rose-600 dark:border-rose-500/20 dark:bg-rose-500/[0.08] dark:text-rose-300"
          : "border-slate-200 bg-slate-50/60 text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50",
      ].join(" ")}
      data-testid="opencode-go-usage-footprint"
    >
      <Gauge size={12} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{message}</span>
    </div>
  );

  // Same bar as an AI account card: fill is the row's own background, label,
  // countdown and percentage share one line. Both pages import it from
  // @features/quota-preview so neither can drift.
  if (!queryReady) {
    return (
      <div className="mt-3">
        {renderPlaceholder(
          t("providers.opencode_go_usage_not_configured"),
          "muted",
        )}
      </div>
    );
  }

  return (
    <div className="mt-3">
      {isLoading && !hasUsage ? (
        <div className="w-full space-y-1.5 motion-safe:animate-pulse">
          {windowTypes.map((type) => (
            <QuotaBar
              key={type}
              label={getCompactUsageLabel(type, usageByType, t)}
              percent={null}
              percentText={remainingUnknownText}
            />
          ))}
        </div>
      ) : hasUsage ? (
        <div className="w-full space-y-1.5">
          {windowTypes.map((type) => {
            const item = getUsageItemForType(type, usageByType);
            const remaining = resolveRemainingPercent(item?.percentage);
            const remainingText =
              remaining === null
                ? remainingUnknownText
                : t("providers.opencode_go_usage_remaining_percent", {
                    percent: formatPercent(remaining),
                  });

            return (
              <QuotaBar
                key={type}
                label={getCompactUsageLabel(type, usageByType, t)}
                percent={remaining}
                percentText={remainingText}
                detailText={item?.resets_in?.trim() || null}
              />
            );
          })}
          {errorText ? (
            <p className="text-2xs font-medium text-rose-600 dark:text-rose-300">
              {errorText}
            </p>
          ) : null}
        </div>
      ) : errorText ? (
        renderPlaceholder(errorText, "error")
      ) : !isLoading ? (
        renderPlaceholder(t("providers.channel_usage_not_queried"), "muted")
      ) : null}
    </div>
  );
}

export function OpenCodeGoUsageRefreshButton({
  cacheKey,
  usageStore,
  onRefresh,
}: {
  cacheKey: string;
  usageStore: OpenCodeGoUsageStore;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const snapshot = useOpenCodeGoUsageSnapshot(usageStore, cacheKey);
  const loading = snapshot.loading;
  // Always visible, like the power and menu buttons beside it. Revealing it on
  // hover shifted the whole control cluster as the pointer arrived.
  const refreshLabel = t("providers.channel_usage_refresh");

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRefresh();
      }}
      disabled={loading}
      className={[
        // Matches the power and menu buttons it now sits beside in the header.
        "inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 transition-all duration-150",
        "text-slate-500 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25",
        "dark:bg-white/10 dark:text-white/55 dark:hover:bg-white/15 dark:hover:text-white/80 dark:focus-visible:ring-white/20",
      ].join(" ")}
      aria-label={refreshLabel}
      title={refreshLabel}
    >
      <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
    </button>
  );
}
