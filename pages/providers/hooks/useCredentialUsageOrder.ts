import { useEffect, useMemo, useState } from "react";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import type { OpenCodeGoUsageStore } from "../components/OpenCodeGoUsageCardSection";
import { getProviderUsageCacheKey, type ProviderUsageProvider } from "../provider-usage-config";
import {
  resolveCredentialDisplayOrder,
  resolveEntryRemaining,
  type CredentialUsageSortMode,
} from "../provider-usage-sort";

/**
 * Display order for a channel's credentials, following live usage readings.
 *
 * Usage arrives asynchronously and per credential — each card refreshes on its
 * own — so the order has to react as readings land rather than being computed
 * once. This subscribes to every credential's cache slot and recomputes when any
 * of them changes.
 *
 * In `config` mode nothing is subscribed and the natural order is returned, so
 * the default view costs nothing.
 */
export function useCredentialUsageOrder(
  provider: ProviderUsageProvider,
  items: ProviderSimpleConfig[],
  usageStore: OpenCodeGoUsageStore,
  mode: CredentialUsageSortMode,
): number[] {
  const cacheKeys = useMemo(
    () => items.map((item, index) => getProviderUsageCacheKey(provider, item, index)),
    [provider, items],
  );

  // Bumped on any subscribed change; the order itself is derived below so a
  // reading that does not move anything does not re-render the list.
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (mode === "config") return;
    const unsubscribes = cacheKeys.map((cacheKey) =>
      usageStore.subscribe(cacheKey, () => setRevision((value) => value + 1)),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [cacheKeys, mode, usageStore]);

  return useMemo(
    () =>
      resolveCredentialDisplayOrder(cacheKeys.length, mode, (index) =>
        resolveEntryRemaining(usageStore.getSnapshot(cacheKeys[index]).usageEntry),
      ),
    // revision is a change signal, not a value the computation reads directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheKeys, mode, usageStore, revision],
  );
}
