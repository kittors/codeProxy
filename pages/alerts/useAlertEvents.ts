import { useCallback, useEffect, useState } from "react";
import { alertsApi, type AlertEvent } from "@code-proxy/api-client";

/** 页面一次最多拉这么多条（后端也只留最近 200 条）。 */
export const EVENTS_PAGE_SIZE = 50;

/**
 * 最近的告警记录。`active` 为真时才请求：用户没点开「最近记录」之前不发请求；每次重新点开都刷新一次，
 * 上一次的内容先留着，不会闪一下空白。
 */
export function useAlertEvents(active: boolean) {
  const [items, setItems] = useState<AlertEvent[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    alertsApi
      .listEvents(EVENTS_PAGE_SIZE, { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setItems(Array.isArray(response?.items) ? response.items : []);
        setTotal(
          typeof response?.total === "number" ? response.total : (response?.items?.length ?? 0),
        );
        setError("");
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { items, total, error, loading, reload };
}
