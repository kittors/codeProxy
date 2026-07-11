import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OpenCodeGoUsageItem } from "@code-proxy/api-client";

export interface OpenCodeGoUsageCacheEntry {
  sourceId?: string;
  workspaceId?: string;
  usage: OpenCodeGoUsageItem[];
  updatedAt: number;
  error?: string;
}

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

type OpenCodeGoUsageState = Record<string, OpenCodeGoUsageCacheEntry>;
type OpenCodeGoUsageSnapshot = {
  usageEntry?: OpenCodeGoUsageCacheEntry;
  loading: boolean;
};
type OpenCodeGoUsageListener = () => void;

export interface OpenCodeGoUsageStore {
  getSnapshot: (cacheKey: string) => OpenCodeGoUsageSnapshot;
  subscribe: (cacheKey: string, listener: OpenCodeGoUsageListener) => () => void;
  setLoading: (cacheKey: string, loading: boolean) => void;
  updateEntry: (
    cacheKey: string,
    updater: (existing: OpenCodeGoUsageCacheEntry | undefined) => OpenCodeGoUsageCacheEntry,
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
      const staleKeys = Object.keys(entries).filter((key) => !validKeys.has(key));
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
        return previous.usageEntry === next.usageEntry && previous.loading === next.loading
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

const resolveRemainingPercent = (usagePercentage: number | undefined): number | null => {
  if (typeof usagePercentage !== "number" || !Number.isFinite(usagePercentage)) return null;
  return clampPercent(100 - clampPercent(usagePercentage));
};

const formatPercent = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");

const resolveRemainingTone = (
  remaining: number | null,
): { fillClass: string; percentClass: string } => {
  if (remaining === null) {
    return {
      fillClass: "bg-slate-300/50 dark:bg-white/10",
      percentClass: "text-slate-600 dark:text-white/65",
    };
  }

  if (remaining >= 60) {
    return {
      fillClass: "bg-emerald-500",
      percentClass: "text-emerald-700 dark:text-emerald-200",
    };
  }

  if (remaining >= 20) {
    return {
      fillClass: "bg-amber-500",
      percentClass: "text-amber-700 dark:text-amber-200",
    };
  }

  return {
    fillClass: "bg-rose-500",
    percentClass: "text-rose-700 dark:text-rose-200",
  };
};

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
  const isLoading = queryReady ? (loading ?? (snapshot.loading || !snapshot.usageEntry)) : false;
  const remainingUnknownText = t("providers.opencode_go_usage_remaining_unknown");

  const usageByType = new Map(
    (usageEntry?.usage ?? []).map((item) => [item.type.toLowerCase(), item]),
  );

  const hasUsage = Boolean(usageEntry && usageEntry.usage.length > 0);

  if (!queryReady) {
    return (
      <div
        className="mt-3 min-h-[3.375rem]"
        data-testid="opencode-go-usage-footprint"
        aria-hidden="true"
      >
        <div className="invisible mx-auto w-full max-w-[20rem] space-y-1.5">
          {windowTypes.map((type) => (
            <div
              key={type}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.25rem] items-center gap-2"
            >
              <span className="truncate text-xs font-semibold">
                {getCompactUsageLabel(type, usageByType, t)}
              </span>
              <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/8" />
              <span className="text-right text-xs tabular-nums">{remainingUnknownText}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 min-h-[3.375rem]">
      {isLoading && !hasUsage ? (
        <div className="space-y-2">
          {windowTypes.map((type) => (
            <div
              key={type}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.25rem] items-center gap-2"
            >
              <span className="truncate text-xs font-semibold text-slate-400 dark:text-white/45">
                {getCompactUsageLabel(type, usageByType, t)}
              </span>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/8">
                <div className="absolute inset-y-0 -left-full w-1/2 animate-pulse rounded-full bg-slate-300/50 dark:bg-white/20" />
              </div>
              <span className="text-right text-xs tabular-nums text-slate-400 dark:text-white/45">
                {remainingUnknownText}
              </span>
            </div>
          ))}
        </div>
      ) : hasUsage ? (
        <div className="mx-auto w-full max-w-[20rem] space-y-1.5">
          {windowTypes.map((type) => {
            const item = getUsageItemForType(type, usageByType);
            const remaining = resolveRemainingPercent(item?.percentage);
            const tone = resolveRemainingTone(remaining);
            const remainingText =
              remaining === null
                ? remainingUnknownText
                : t("providers.opencode_go_usage_remaining_percent", {
                    percent: formatPercent(remaining),
                  });

            return (
              <div
                key={type}
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_5.25rem] items-center gap-2"
              >
                <span className="truncate text-xs font-semibold text-slate-600 dark:text-white/65">
                  {getCompactUsageLabel(type, usageByType, t)}
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <div
                    className={["h-full rounded-full", tone.fillClass].join(" ")}
                    style={{ width: `${remaining ?? 0}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span
                  className={[
                    "truncate text-right text-xs font-semibold tabular-nums",
                    tone.percentClass,
                  ].join(" ")}
                >
                  {remainingText}
                </span>
              </div>
            );
          })}
        </div>
      ) : !isLoading ? (
        <p className="text-xs text-slate-400 dark:text-white/45">
          {t("providers.opencode_go_usage_not_queried")}
        </p>
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
