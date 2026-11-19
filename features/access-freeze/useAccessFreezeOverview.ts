import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accessFreezesApi, type AccessFreeze } from "@code-proxy/api-client";
import { isFreezeUnavailable } from "./format";

/** 本租户生效中的冻结按后端的上限一次取全：实际数量很少，不分页。 */
const ACTIVE_LIMIT = 1000;

export interface AccessFreezeOverview {
  /** 生效中的冻结，按冻结时间倒序。 */
  freezes: AccessFreeze[];
  loading: boolean;
  /** 最近一次读取失败的原因；成功后清空。 */
  error: unknown;
  /** 后端没有数据库（503 access_freezes_unavailable）：冻结用不了，界面整块不出现。 */
  unavailable: boolean;
  /** 门户账号 id → 它名下生效中的冻结。 */
  byEndUser: ReadonlyMap<string, AccessFreeze[]>;
  /** 不属于任何门户账号的 Key 的冻结。 */
  apiKeyFreezes: AccessFreeze[];
  refresh: () => Promise<void>;
}

/**
 * 门户账号页要用的「生效中的冻结」：列表行上的标签、页面级入口的计数、总览弹窗都读它。
 * 只在后端声明了 `access-freezes` 能力（enabled）时请求；面板会自动更新到仍是旧后端的部署上。
 *
 * 冻结是网关在请求里产生的，页面不会实时推送：进页面读一次，管理员自己解冻之后再读一次。
 */
export function useAccessFreezeOverview(enabled: boolean): AccessFreezeOverview {
  const [freezes, setFreezes] = useState<AccessFreeze[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // 较晚发出的读取才有资格写入状态：快速连点刷新、或能力位刚变化时，先发出的请求后到。
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const ticket = ++latest.current;
    if (!enabled) {
      setFreezes([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await accessFreezesApi.list({ status: "active", limit: ACTIVE_LIMIT });
      if (ticket !== latest.current) return;
      setFreezes(items);
      setError(null);
    } catch (err) {
      if (ticket !== latest.current) return;
      setFreezes([]);
      setError(err);
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    return () => {
      // 卸载或能力位变化后，在途请求的结果不再写入。
      latest.current += 1;
    };
  }, [refresh]);

  const { byEndUser, apiKeyFreezes } = useMemo(() => {
    const grouped = new Map<string, AccessFreeze[]>();
    const keys: AccessFreeze[] = [];
    for (const freeze of freezes) {
      if (freeze.subject.kind === "end_user") {
        const list = grouped.get(freeze.subject.id) ?? [];
        list.push(freeze);
        grouped.set(freeze.subject.id, list);
      } else if (freeze.subject.kind === "api_key") {
        keys.push(freeze);
      }
    }
    return { byEndUser: grouped, apiKeyFreezes: keys };
  }, [freezes]);

  return {
    freezes,
    loading,
    error,
    unavailable: isFreezeUnavailable(error),
    byEndUser,
    apiKeyFreezes,
    refresh,
  };
}
