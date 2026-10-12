import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IDENTITY_TENANTS_UPDATED_EVENT,
  identityApi,
} from "@code-proxy/api-client/endpoints/identity";
import { sharingTenantNames, toSharingTenants, type SharingTenant } from "./sharingTenants";

/**
 * 共享设置要用的租户目录（GET /tenants，只有平台管理员能读）。只在能管理共享时拉取：
 * 普通租户既没有权限，也用不到。租户在别处被新建、改名、停用后跟着刷新。
 */
export function useSharingTenants(enabled: boolean) {
  const [tenants, setTenants] = useState<SharingTenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");
    try {
      const response = await identityApi.tenants();
      if (seq !== requestSeq.current) return;
      setTenants(toSharingTenants(Array.isArray(response?.items) ? response.items : []));
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestSeq.current += 1;
      setTenants([]);
      setLoading(false);
      setError("");
      return;
    }
    void load();
    const onTenantsUpdated = () => void load();
    window.addEventListener(IDENTITY_TENANTS_UPDATED_EVENT, onTenantsUpdated);
    return () => {
      window.removeEventListener(IDENTITY_TENANTS_UPDATED_EVENT, onTenantsUpdated);
      requestSeq.current += 1;
    };
  }, [enabled, load]);

  const names = useMemo(() => sharingTenantNames(tenants), [tenants]);

  return { tenants, names, loading, error, reload: load };
}
