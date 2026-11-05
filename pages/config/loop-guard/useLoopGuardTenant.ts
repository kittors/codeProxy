import { useEffect, useState } from "react";
import { loopGuardApi, type LoopGuardTenantView } from "@code-proxy/api-client";
import { useOptionalAuth } from "@app/providers/AuthProvider";

/**
 * 读一次当前租户的循环保护设置。读不到（旧后端没有这个接口、当前账号没有租户设置的读权限、
 * 响应不是循环保护的形状）就是 null，配置页据此不显示「循环保护」分区，而不是放一个点了就报错的开关。
 */
export function useLoopGuardTenant(): LoopGuardTenantView | null {
  const auth = useOptionalAuth();
  const canRead = auth?.can("tenant_settings.read") ?? true;
  const [settings, setSettings] = useState<LoopGuardTenantView | null>(null);
  useEffect(() => {
    if (!canRead) {
      setSettings(null);
      return;
    }
    let cancelled = false;
    loopGuardApi
      .getTenant()
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [canRead]);
  return settings;
}
