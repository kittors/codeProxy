import { apiClient } from "../client/client";

/** Legacy enum; superseded by RoutingConfigScheduling but still written on save. */
export type RoutingStrategy = "round-robin" | "fill-first" | "session-sticky";

export type RoutingDistribution = "weighted" | "least-load" | "fill-first";

export interface RoutingConfigSticky {
  enabled?: boolean;
  "max-requests"?: number;
  "release-at-load"?: number;
}

export interface RoutingConfigScheduling {
  distribution?: RoutingDistribution;
  sticky?: RoutingConfigSticky;
  "channel-weights"?: Record<string, number>;
}

export interface RoutingConfigGroupItem {
  name?: string;
  description?: string;
  strategy?: RoutingStrategy;
  scheduling?: RoutingConfigScheduling;
  "exclude-from-default"?: boolean;
  match?: {
    channels?: string[];
    tags?: string[];
  };
  "channel-priorities"?: Record<string, number>;
  /** Frozen allow list: models added upstream later are rejected. */
  "allowed-models"?: string[];
  /**
   * "All but these", so models added upstream later stay usable. Only write it
   * when the backend advertises `channel-group-excluded-models`: an older one
   * drops it silently, leaving whatever allow list remains.
   */
  "excluded-models"?: string[];
}

/** What the backend can enforce. Read-only: GET returns it, PUT ignores it. */
export interface RoutingConfigCapabilities {
  "channel-group-excluded-models"?: boolean;
}

/** Capabilities normalized for the panel; anything not advertised reads as unsupported. */
export interface RoutingConfigSupport {
  /** The backend stores and enforces `excluded-models` on channel groups. */
  channelGroupExcludedModels: boolean;
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
  /** Response only. Absent on backends that predate it, which is itself the answer. */
  capabilities?: RoutingConfigCapabilities;
}

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * Reads the capabilities of a GET /routing-config response. The panel ships on
 * its own schedule (CliRelay pulls the latest release), so it can run against a
 * backend older than itself; only an explicit `true` unlocks a feature.
 */
export function readRoutingConfigSupport(payload: unknown): RoutingConfigSupport {
  const capabilities = asRecord(asRecord(payload)?.capabilities);
  return {
    channelGroupExcludedModels: capabilities?.["channel-group-excluded-models"] === true,
  };
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
