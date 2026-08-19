import type { OpenCodeGoUsageItem } from "@code-proxy/api-client";
import type { OpenCodeGoUsageCacheEntry } from "./components/OpenCodeGoUsageCardSection";

export type CredentialUsageSortMode = "config" | "remaining_asc" | "remaining_desc";

export const CREDENTIAL_USAGE_SORT_MODES: readonly CredentialUsageSortMode[] = [
  "config",
  "remaining_asc",
  "remaining_desc",
];

export const isCredentialUsageSortMode = (
  value: unknown,
): value is CredentialUsageSortMode =>
  typeof value === "string" &&
  (CREDENTIAL_USAGE_SORT_MODES as readonly string[]).includes(value);

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

/**
 * The remaining headroom of a single window, as a percentage.
 *
 * The upstream reports consumption, so remaining is its complement. Mirrors
 * the arithmetic the usage card renders with, so a credential can never sort by
 * one number and display another.
 */
export const resolveWindowRemaining = (
  usagePercentage: number | undefined,
): number | null => {
  if (typeof usagePercentage !== "number" || !Number.isFinite(usagePercentage)) {
    return null;
  }
  return clampPercent(100 - clampPercent(usagePercentage));
};

/**
 * The headroom that decides a credential's position: the tightest window it has.
 *
 * A credential with a comfortable monthly allowance but an exhausted 5-hour
 * window is exhausted right now, and sorting it as though it were plentiful is
 * the failure this feature exists to prevent. Taking the minimum answers the
 * question an operator is actually asking — "which key can I use next" — rather
 * than the more flattering one.
 *
 * Returns null when no window carries a usable number; callers park those
 * credentials rather than treating unknown as full or as empty.
 */
export const resolveCredentialRemaining = (
  usage: readonly OpenCodeGoUsageItem[] | undefined,
): number | null => {
  if (!usage || usage.length === 0) return null;
  let tightest: number | null = null;
  for (const window of usage) {
    const remaining = resolveWindowRemaining(window?.percentage);
    if (remaining === null) continue;
    if (tightest === null || remaining < tightest) tightest = remaining;
  }
  return tightest;
};

export const resolveEntryRemaining = (
  entry: OpenCodeGoUsageCacheEntry | undefined,
): number | null => {
  // An entry that failed to load carries no usable reading even if a previous
  // response is still attached to it.
  if (!entry || entry.error) return null;
  return resolveCredentialRemaining(entry.usage);
};

/**
 * Order credentials for display without disturbing their identity.
 *
 * Returns positions into the original array rather than reordered items: the
 * card list uses that index for edit, delete and the usage cache key, so a
 * genuinely reordered array would edit the wrong credential and read another
 * one's usage.
 *
 * Credentials with no reading always sort last, in both directions. They are
 * unknown, not empty and not full, and floating them to the top of either order
 * would push the credentials an operator wants to see off the first screen.
 * Ties keep their configured order, so repeated renders do not shuffle.
 */
export const resolveCredentialDisplayOrder = (
  count: number,
  mode: CredentialUsageSortMode,
  readRemaining: (index: number) => number | null,
): number[] => {
  const positions = Array.from({ length: Math.max(0, count) }, (_, index) => index);
  if (mode === "config") return positions;

  const remainingByIndex = positions.map(readRemaining);
  const direction = mode === "remaining_asc" ? 1 : -1;

  return positions.sort((left, right) => {
    const leftValue = remainingByIndex[left];
    const rightValue = remainingByIndex[right];
    if (leftValue === null && rightValue === null) return left - right;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    if (leftValue === rightValue) return left - right;
    return (leftValue - rightValue) * direction;
  });
};

const SORT_MODE_STORAGE_KEY = "providers-page:credential-usage-sort";

/**
 * The chosen order survives reloads, following the same pattern as the active
 * tab. An operator who sorted by remaining quota to find a usable key is still
 * looking for one after a refresh.
 */
export const readSavedCredentialSortMode = (): CredentialUsageSortMode => {
  try {
    const saved = localStorage.getItem(SORT_MODE_STORAGE_KEY);
    if (isCredentialUsageSortMode(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); the default
    // order is a fine answer and is not worth failing the page over.
  }
  return "config";
};

export const saveCredentialSortMode = (mode: CredentialUsageSortMode): void => {
  try {
    localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
};
