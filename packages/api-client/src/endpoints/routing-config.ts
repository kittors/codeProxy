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
  /** The backend serves virtual models (GET/PUT /routing-config/virtual-models). */
  "virtual-models"?: boolean;
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
  /** The backend serves virtual models. */
  virtualModels: boolean;
}

/** What a backend that advertises nothing supports. */
export const NO_ROUTING_CONFIG_SUPPORT: RoutingConfigSupport = {
  channelGroupExcludedModels: false,
  channelGroupFollowUpstreamModels: false,
  channelGroupFirstTokenTimeout: false,
  channelGroupBusyWait: false,
  channelGroupResetAwareDistribution: false,
  routingSimulation: false,
  virtualModels: false,
};

export interface RoutingConfigPathRouteItem {
  path?: string;
  group?: string;
  "strip-prefix"?: boolean;
  fallback?: "none" | "default";
}

/**
 * A member of a virtual model: a real model, optionally confined to one channel
 * group. Without a group it runs where the request would run a model it named
 * itself (its path route, the key's channel groups, or the default group).
 */
export interface RoutingVirtualModelMember {
  group?: string;
  model: string;
  /** Share of first picks under the weighted strategy; 0 is only ever a fallback. */
  weight?: number;
}

/** `order` tries the members as listed; `weighted` picks the first one by weight. */
export type RoutingVirtualModelStrategy = "order" | "weighted";

/**
 * A model name the gateway serves from one of several real models (CliRelay
 * `routing.virtual-models`). A request runs on the first member that can take it
 * and moves on to the next one while nothing has reached the client.
 */
export interface RoutingVirtualModel {
  name: string;
  description?: string;
  /** Stored empty for `order`. */
  strategy?: RoutingVirtualModelStrategy | "";
  members: RoutingVirtualModelMember[];
}

/** The virtual models and the version of the routing config they were read at. */
export interface RoutingVirtualModelsSnapshot {
  virtualModels: RoutingVirtualModel[];
  version: number;
}

export interface RoutingConfigItem {
  strategy?: RoutingStrategy;
  "include-default-group"?: boolean;
  "channel-groups"?: RoutingConfigGroupItem[];
  "path-routes"?: RoutingConfigPathRouteItem[];
  /**
   * Read only for this client: the channel group editor leaves the key out of its
   * PUT, which keeps them, and edits them through routingVirtualModelsApi.
   */
  "virtual-models"?: RoutingVirtualModel[];
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
    virtualModels: capabilities?.["virtual-models"] === true,
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

const readMember = (value: unknown): RoutingVirtualModelMember | null => {
  const raw = asRecord(value);
  const model = typeof raw?.model === "string" ? raw.model.trim() : "";
  if (!raw || !model) return null;
  const group = typeof raw.group === "string" ? raw.group.trim() : "";
  const weight = typeof raw.weight === "number" && raw.weight > 0 ? Math.floor(raw.weight) : 0;
  return { ...(group ? { group } : {}), model, ...(weight > 0 ? { weight } : {}) };
};

/**
 * The virtual models of a response; anything that is not one is dropped. The
 * strategy is left out unless it is `weighted`, as the backend stores it, so a
 * virtual model nobody edited goes back on PUT as it came.
 */
export function readRoutingVirtualModels(value: unknown): RoutingVirtualModel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RoutingVirtualModel[] => {
    const raw = asRecord(entry);
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    if (!raw || !name) return [];
    const members = Array.isArray(raw.members)
      ? raw.members.map(readMember).filter((m): m is RoutingVirtualModelMember => m !== null)
      : [];
    const description = typeof raw.description === "string" ? raw.description.trim() : "";
    return [
      {
        name,
        ...(description ? { description } : {}),
        ...(raw.strategy === "weighted" ? { strategy: "weighted" as const } : {}),
        members,
      },
    ];
  });
}

export const routingVirtualModelsApi = {
  async get(options?: { signal?: AbortSignal }): Promise<RoutingVirtualModelsSnapshot> {
    const data = await (options?.signal
      ? apiClient.get<Record<string, unknown>>("/routing-config/virtual-models", {
          signal: options.signal,
        })
      : apiClient.get<Record<string, unknown>>("/routing-config/virtual-models"));
    const version = Number(data?.version);
    return {
      virtualModels: readRoutingVirtualModels(data?.["virtual-models"]),
      version: Number.isFinite(version) && version > 0 ? version : 0,
    };
  },
  /**
   * Replaces the tenant's virtual models. `version` is the one they were read at:
   * a change made since then answers 409 `config_version_conflict`.
   */
  update: (virtualModels: RoutingVirtualModel[], version: number) =>
    apiClient.put("/routing-config/virtual-models", {
      "virtual-models": virtualModels,
      version,
    }),
};
