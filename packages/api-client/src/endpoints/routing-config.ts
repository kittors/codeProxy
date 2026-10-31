import { apiClient } from "../client/client";

/** Legacy enum; superseded by RoutingConfigScheduling but still written on save. */
export type RoutingStrategy = "round-robin" | "fill-first" | "session-sticky";

/**
 * `reset-aware` is only written when the backend advertises
 * `channel-group-distribution-reset-aware`: an older one reads it as weighted.
 */
export type RoutingDistribution = "weighted" | "least-load" | "fill-first" | "reset-aware";

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
  /**
   * With an allow list: also admit what Codex discovery lists after the list
   * was saved. Absent means never set, which the backend reads as on for the
   * default group and off for every other one. Only changed when the backend
   * advertises `channel-group-follow-upstream-models`.
   */
  "follow-upstream-models"?: boolean;
  /**
   * Seconds a stream may go without its first token before the attempt is
   * abandoned and, when nothing reached the client yet, retried on another
   * account. Absent or 0 is off. Only written when the backend advertises
   * `channel-group-first-token-timeout`.
   */
  "first-token-timeout-seconds"?: number;
  /**
   * Longest a request waits when every account it may use is cooling down
   * after a recoverable failure. Waiting is opt-in: absent and 0 are both
   * off (an explicit 0 is still stored). Only written when the backend
   * advertises `channel-group-busy-wait`.
   */
  "busy-wait-max-seconds"?: number;
}

/** What the backend can enforce. Read-only: GET returns it, PUT ignores it. */
export interface RoutingConfigCapabilities {
  "channel-group-excluded-models"?: boolean;
  "channel-group-follow-upstream-models"?: boolean;
  "channel-group-first-token-timeout"?: boolean;
  "channel-group-busy-wait"?: boolean;
  "channel-group-distribution-reset-aware"?: boolean;
  /** GET /routing-simulation is there to simulate a request. */
  "routing-simulation"?: boolean;
}

/** Capabilities normalized for the panel; anything not advertised reads as unsupported. */
export interface RoutingConfigSupport {
  /** The backend stores and enforces `excluded-models` on channel groups. */
  channelGroupExcludedModels: boolean;
  /** The backend stores and enforces `follow-upstream-models` on channel groups. */
  channelGroupFollowUpstreamModels: boolean;
  /** The backend enforces `first-token-timeout-seconds` on channel groups. */
  channelGroupFirstTokenTimeout: boolean;
  /** The backend enforces `busy-wait-max-seconds` on channel groups. */
  channelGroupBusyWait: boolean;
  /** Channel groups accept the reset-aware distribution. */
  channelGroupResetAwareDistribution: boolean;
  /** The backend can simulate where a request would go (GET /routing-simulation). */
  routingSimulation: boolean;
}

/** What a backend that advertises nothing supports. */
export const NO_ROUTING_CONFIG_SUPPORT: RoutingConfigSupport = {
  channelGroupExcludedModels: false,
  channelGroupFollowUpstreamModels: false,
  channelGroupFirstTokenTimeout: false,
  channelGroupBusyWait: false,
  channelGroupResetAwareDistribution: false,
  routingSimulation: false,
};

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
    channelGroupFollowUpstreamModels:
      capabilities?.["channel-group-follow-upstream-models"] === true,
    channelGroupFirstTokenTimeout: capabilities?.["channel-group-first-token-timeout"] === true,
    channelGroupBusyWait: capabilities?.["channel-group-busy-wait"] === true,
    channelGroupResetAwareDistribution:
      capabilities?.["channel-group-distribution-reset-aware"] === true,
    routingSimulation: capabilities?.["routing-simulation"] === true,
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
