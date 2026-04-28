import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { proxiesApi, type ProxyCheckResult, type ProxyPoolEntry } from "@/lib/http/apis/proxies";
import {
  readCachedProxyCheckState,
  writeCachedProxyCheckState,
  type ProxyCheckState,
} from "@/modules/proxies/proxy-utils";

export function useProxyPoolChecks(entries: ProxyPoolEntry[], active: boolean): ProxyCheckState {
  const { t } = useTranslation();
  const autoCheckedProxyIDs = useRef<Set<string>>(new Set());
  const [checkState, setCheckState] = useState<ProxyCheckState>(() => readCachedProxyCheckState());

  useEffect(() => {
    if (!active) {
      autoCheckedProxyIDs.current.clear();
      return;
    }
    setCheckState(readCachedProxyCheckState());
  }, [active]);

  const storeProxyCheckResult = useCallback((id: string, result: ProxyCheckResult) => {
    setCheckState((prev) => {
      const next = { ...prev, [id]: result };
      writeCachedProxyCheckState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active || entries.length === 0) return;

    const pendingEntries = entries.filter((entry) => {
      const id = entry.id.trim();
      if (!id || autoCheckedProxyIDs.current.has(id)) return false;
      const result = checkState[id];
      return typeof result?.latencyMs !== "number";
    });
    if (pendingEntries.length === 0) return;

    setCheckState((prev) => {
      const next = { ...prev };
      for (const entry of pendingEntries) {
        const id = entry.id.trim();
        autoCheckedProxyIDs.current.add(id);
        next[id] = { ...next[id], checking: true };
      }
      return next;
    });

    pendingEntries.forEach((entry) => {
      const id = entry.id.trim();
      void proxiesApi
        .check({ id })
        .then((result) => storeProxyCheckResult(id, result))
        .catch((error) =>
          storeProxyCheckResult(id, {
            ok: false,
            message: error instanceof Error ? error.message : t("common.error"),
          }),
        );
    });
  }, [active, checkState, entries, storeProxyCheckResult, t]);

  return checkState;
}
