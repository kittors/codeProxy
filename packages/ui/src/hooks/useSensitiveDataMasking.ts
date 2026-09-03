import { useCallback, useEffect, useState } from "react";

export const SENSITIVE_DATA_MASKING_STORAGE_KEY = "code-proxy-mask-sensitive-data";
const MASKING_CHANGE_EVENT = "code-proxy-masking-changed";

/**
 * Hook to manage sensitive data masking preference.
 * Defaults to false (unmasked), synchronized via localStorage and CustomEvent
 * across all pages and components.
 */
export function useSensitiveDataMasking(): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const [masked, setMaskedState] = useState<boolean>(() => {
    try {
      const item = window.localStorage.getItem(SENSITIVE_DATA_MASKING_STORAGE_KEY);
      return item ? JSON.parse(item) === true : false;
    } catch {
      return false;
    }
  });

  const setMasked = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setMaskedState((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      try {
        window.localStorage.setItem(SENSITIVE_DATA_MASKING_STORAGE_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(MASKING_CHANGE_EVENT, { detail: next }));
      } catch (e) {
        console.error("Failed to save masking preference:", e);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        setMaskedState(customEvent.detail);
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SENSITIVE_DATA_MASKING_STORAGE_KEY && e.newValue !== null) {
        try {
          setMaskedState(JSON.parse(e.newValue) === true);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener(MASKING_CHANGE_EVENT, handleCustomChange);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(MASKING_CHANGE_EVENT, handleCustomChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return [masked, setMasked];
}
