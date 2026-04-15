import { apiClient } from "@/lib/http/client";

export interface RoutingConfigGroupItem {
  name?: string;
  description?: string;
  match?: {
    channels?: string[];
  };
  "channel-priorities"?: Record<string, number>;
}

export interface RoutingConfigPathRouteItem {
  path?: string;
  group?: string;
  "strip-prefix"?: boolean;
  fallback?: "none" | "default";
}

export interface RoutingConfigItem {
  strategy?: "round-robin" | "fill-first";
  "include-default-group"?: boolean;
  "channel-groups"?: RoutingConfigGroupItem[];
  "path-routes"?: RoutingConfigPathRouteItem[];
}

export const routingConfigApi = {
  get: () => apiClient.get<RoutingConfigItem>("/routing-config"),
  update: (payload: RoutingConfigItem) => apiClient.put("/routing-config", payload),
};
