import { apiClient } from "../client/client";

export type RoutingStrategy = "round-robin" | "fill-first" | "session-sticky";

export interface RoutingConfigGroupItem {
  name?: string;
  description?: string;
  strategy?: RoutingStrategy;
  "exclude-from-default"?: boolean;
  match?: {
    channels?: string[];
    tags?: string[];
  };
  "channel-priorities"?: Record<string, number>;
  "allowed-models"?: string[];
}

export interface RoutingConfigPathRouteItem {
  path?: string;
  group?: string;
  "strip-prefix"?: boolean;
  fallback?: "none" | "default";
}

export interface RoutingConfigItem {
  strategy?: RoutingStrategy;
  "include-default-group"?: boolean;
  "channel-groups"?: RoutingConfigGroupItem[];
  "path-routes"?: RoutingConfigPathRouteItem[];
}

export const routingConfigApi = {
  get: (options?: { signal?: AbortSignal }) => {
    if (options?.signal) {
      return apiClient.get<RoutingConfigItem>("/routing-config", { signal: options.signal });
    }
    return apiClient.get<RoutingConfigItem>("/routing-config");
  },
  update: (payload: RoutingConfigItem) => apiClient.put("/routing-config", payload),
};
