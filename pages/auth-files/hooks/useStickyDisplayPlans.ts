import { useCallback, useEffect, useRef } from "react";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  getActiveCacheTenantId,
  readAuthFilesDataCache,
  resolveAuthFileDisplayPlanType,
  writeAuthFilesDataCache,
  type AuthFileCycleBudgetStats,
} from "@code-proxy/domain";
import type { QuotaState } from "@features/quota-preview/quota-helpers";

/**
 * Keeps the last resolved plan tier per auth file so PRO / PRO 5X / PRO 20X badges
 * survive partial refreshes, and persists it into the active tenant's cache.
 */
export function useStickyDisplayPlans() {
// Sticky last-good plan tier so PRO / PRO 5X / PRO 20X do not flash on partial refresh
// or full remount. Seed from tenant cache; memory alone dies on route leave / F5.
// Reseeded whenever the active tenant changes so plans never leak across tenants.
const stickyDisplayPlanRef = useRef<Map<string, string> | null>(null);
const stickyTenantRef = useRef<string | null>(null);
const readStickyDisplayPlans = useCallback((): Map<string, string> => {
  const tenantId = getActiveCacheTenantId();
  if (stickyDisplayPlanRef.current === null || stickyTenantRef.current !== tenantId) {
    const seeded = new Map<string, string>();
    const cached = readAuthFilesDataCache(tenantId);
    for (const [name, plan] of Object.entries(cached?.displayPlanByFileName ?? {})) {
      if (name && plan) seeded.set(name, plan);
    }
    stickyDisplayPlanRef.current = seeded;
    stickyTenantRef.current = tenantId;
  }
  return stickyDisplayPlanRef.current;
}, []);
const persistDisplayPlanTimerRef = useRef<number | null>(null);
useEffect(
  () => () => {
    if (typeof window !== "undefined" && persistDisplayPlanTimerRef.current != null) {
      window.clearTimeout(persistDisplayPlanTimerRef.current);
    }
  },
  [],
);
const schedulePersistDisplayPlans = useCallback(() => {
  if (typeof window === "undefined") return;
  if (persistDisplayPlanTimerRef.current != null) {
    window.clearTimeout(persistDisplayPlanTimerRef.current);
  }
  // Pin the tenant at schedule time: the sticky map holds this tenant's plans,
  // and a tenant switch inside the debounce window would otherwise write them
  // into the next tenant's cache, where same-named auth files pick up the
  // wrong plan badge during warm paint.
  const scheduledTenantId = getActiveCacheTenantId();
  persistDisplayPlanTimerRef.current = window.setTimeout(() => {
    const tenantId = scheduledTenantId;
    if (tenantId !== getActiveCacheTenantId()) return;
    const current = readAuthFilesDataCache(tenantId);
    if (!current || !Array.isArray(current.files)) return;
    const sticky = stickyDisplayPlanRef.current;
    if (!sticky || sticky.size === 0) return;
    const displayPlanByFileName: Record<string, string> = {
      ...current.displayPlanByFileName,
    };
    for (const [name, plan] of sticky) {
      if (name && plan) displayPlanByFileName[name] = plan;
    }
    writeAuthFilesDataCache({
      ...current,
      tenantId,
      // Keep the bucket's original TTL: badge persistence must not stop the
      // cached files/quotas from ever expiring.
      savedAtMs: current.savedAtMs,
      displayPlanByFileName,
    });
  }, 250);
}, []);
const resolveStickyDisplayPlanType = useCallback(
  (
    file: AuthFileItem,
    quotaState?: QuotaState | null,
    cycleStats?: AuthFileCycleBudgetStats | null,
  ) => {
    const sticky = readStickyDisplayPlans();
    const previous = sticky.get(file.name) ?? null;
    const next = resolveAuthFileDisplayPlanType(file, quotaState, cycleStats, previous);
    if (next && sticky.get(file.name) !== next) {
      sticky.set(file.name, next);
      schedulePersistDisplayPlans();
    }
    return next;
  },
  [readStickyDisplayPlans, schedulePersistDisplayPlans],
);

  return resolveStickyDisplayPlanType;
}
