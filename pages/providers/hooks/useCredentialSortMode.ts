import { useCallback, useEffect, useState } from "react";
import {
  readSavedCredentialSortMode,
  saveCredentialSortMode,
  type CredentialUsageSortMode,
} from "../provider-usage-sort";

/**
 * The credential sort preference, shared by every usage channel on the page.
 *
 * Module-scoped rather than lifted into the page component: the preference
 * belongs to this feature, and the page component is already past its size
 * budget. A shared value also means the four usage tabs cannot disagree — an
 * operator who sorted by remaining quota expects that order on whichever
 * channel they open next, not just the one they were looking at.
 */
let sharedMode: CredentialUsageSortMode | null = null;
const listeners = new Set<(mode: CredentialUsageSortMode) => void>();

const currentMode = (): CredentialUsageSortMode =>
  (sharedMode ??= readSavedCredentialSortMode());

export function useCredentialSortMode(): [
  CredentialUsageSortMode,
  (mode: CredentialUsageSortMode) => void,
] {
  const [mode, setMode] = useState<CredentialUsageSortMode>(currentMode);

  useEffect(() => {
    // Adopt any change made while this tab was unmounted.
    setMode(currentMode());
    const listener = (next: CredentialUsageSortMode) => setMode(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const change = useCallback((next: CredentialUsageSortMode) => {
    sharedMode = next;
    saveCredentialSortMode(next);
    listeners.forEach((listener) => listener(next));
  }, []);

  return [mode, change];
}

/** Test seam: drops the in-memory value so a case starts from storage. */
export function resetCredentialSortModeForTests(): void {
  sharedMode = null;
  listeners.clear();
}
