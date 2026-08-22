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

  // Same bar as an AI account card: fill is the row's own background, label,
  // countdown and percentage share one line. Both pages import it from
  // @features/quota-preview so neither can drift.
  // Same empty state as an AI account card with no quota: a quiet gauge and one
  // line, centred in the space the bars would occupy. An invisible placeholder
  // used to sit here, which read as a rendering fault rather than "this
  // credential has no dashboard login configured".
  if (!queryReady) {
    return (
      <div
        className="mt-3 flex min-h-[5.25rem] flex-col items-center justify-center gap-2 text-center"
        data-testid="opencode-go-usage-footprint"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/90 text-slate-400 dark:bg-white/[0.06] dark:text-white/40"
          aria-hidden="true"
        >
          <Gauge size={16} strokeWidth={1.5} />
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-white/50">
          {t("providers.opencode_go_usage_not_configured")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 min-h-[5.25rem]">
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
        </div>
      ) : !isLoading ? (
        <div className="flex min-h-[5.25rem] flex-col items-center justify-center gap-2 text-center">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100/90 text-slate-400 dark:bg-white/[0.06] dark:text-white/40"
            aria-hidden="true"
          >
            <Gauge size={16} strokeWidth={1.5} />
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-white/50">
            {t("providers.opencode_go_usage_not_queried")}
          </p>
        </div>
      ) : null}

      {usageEntry?.error ? (
        <p className="mt-1 text-xs font-semibold text-rose-700 dark:text-rose-200">
          {usageEntry.error?.length > 60
            ? t("providers.opencode_go_usage_query_failed")
            : usageEntry.error}
        </p>
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
  const snapshot = useOpenCodeGoUsageSnapshot(usageStore, cacheKey);
  const loading = snapshot.loading;
  const hasError = Boolean(snapshot.usageEntry?.error);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRefresh();
      }}
      disabled={loading}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-lg transition-all duration-150",
        "text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25",
        "dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/60 dark:focus-visible:ring-white/20",
        loading || hasError
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
      ].join(" ")}
      aria-label="Refresh usage"
      title="Refresh usage"
    >
      <RefreshCcw size={13} className={loading ? "animate-spin" : ""} />
    </button>
  );
}
