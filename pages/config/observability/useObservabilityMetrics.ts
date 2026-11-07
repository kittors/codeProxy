import { useEffect, useState } from "react";
import { observabilityApi, type ObservabilityMetricsSettings } from "@code-proxy/api-client";

/**
 * 读一次指标接口的设置。读不到（旧后端没有这个接口、或当前账号没有系统配置权限）就是 null，
 * 配置页据此不显示「指标接口」分区，而不是放一个点了就报错的开关。
 */
export function useObservabilityMetrics(): ObservabilityMetricsSettings | null {
  const [settings, setSettings] = useState<ObservabilityMetricsSettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    observabilityApi
      .getMetrics()
      .then((value) => {
        if (!cancelled && value && typeof value.enabled === "boolean") setSettings(value);
      })
      .catch(() => {
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return settings;
}
