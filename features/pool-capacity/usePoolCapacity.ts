import { useCallback, useEffect, useState } from "react";
import { poolCapacityApi, type PoolCapacityEntry } from "@code-proxy/api-client";

export interface PoolCapacityData {
  pools: PoolCapacityEntry[];
  generatedAt: string;
  /** 浏览器收到这份数据的时刻：相对时间（「2 天后」）以它为「现在」，渲染时不再读时钟。 */
  fetchedAtMs: number;
}

/**
 * 读一次池容量，再按需手动刷新。刷新失败时保留上一次的数字（只多一条错误），整卡不会因为一次
 * 网络抖动就消失；第一次就失败才是 error 状态。
 */
export function usePoolCapacity() {
  const [data, setData] = useState<PoolCapacityData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    poolCapacityApi
      .get({ signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData({
          pools: Array.isArray(response?.pools) ? response.pools : [],
          generatedAt: response?.generated_at ?? "",
          fetchedAtMs: Date.now(),
        });
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
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { data, error, loading, reload };
}
