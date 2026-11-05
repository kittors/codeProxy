import { useEffect, useState } from "react";
import { apiClient } from "@code-proxy/api-client";
import { readRoutingConfigSupport } from "@code-proxy/api-client/endpoints/routing-config";
import { getActiveCacheTenantId } from "@code-proxy/domain";
import { useOptionalAuth } from "@app/providers/AuthProvider";

// 按租户记住结果：每次进模型页都要先问一次后端，记住了标签页就不会先缺后有地闪一下。
const supportByTenant = new Map<string, boolean>();

/**
 * 后端是否支持虚拟模型：读 GET /routing-config 的 capabilities。面板会自动更新到最新版本、
 * 可能连着旧后端，所以只认显式的 true；旧后端、或者角色读不了路由配置时都当作不支持，不显示标签页。
 */
export function useVirtualModelsSupport(): boolean {
  const auth = useOptionalAuth();
  const canRead = auth ? auth.can("routing.read") : true;
  const tenant = getActiveCacheTenantId();
  const [supported, setSupported] = useState(() => canRead && supportByTenant.get(tenant) === true);

  useEffect(() => {
    if (!canRead) {
      setSupported(false);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const payload = await apiClient.get("/routing-config");
        const next = readRoutingConfigSupport(payload).virtualModels;
        supportByTenant.set(tenant, next);
        if (alive) setSupported(next);
      } catch {
        // 读不到就保持上次的结论：一次网络抖动不该让标签页消失。
        if (alive) setSupported(supportByTenant.get(tenant) === true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [canRead, tenant]);

  return supported;
}
