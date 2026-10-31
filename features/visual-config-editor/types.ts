export type PayloadParamValueType = "string" | "number" | "boolean" | "json";

export type PayloadParamEntry = {
  id: string;
  path: string;
  valueType: PayloadParamValueType;
  value: string;
};

export type PayloadProtocol =
  | "openai"
  | "openai-response"
  | "gemini"
  | "claude"
  | "codex"
  | "antigravity";

export type PayloadModelEntry = {
  id: string;
  name: string;
  protocol?: PayloadProtocol;
};

export type PayloadRule = {
  id: string;
  models: PayloadModelEntry[];
  params: PayloadParamEntry[];
};

export type PayloadFilterRule = {
  id: string;
  models: PayloadModelEntry[];
  params: string[];
};

export interface RequestLogStorageVisualConfig {
  storeContent: boolean;
  retentionDays: string;
  contentRetentionDays: string;
  cleanupEnabled: boolean;
  cleanupIntervalMinutes: string;
  maxRows: string;
  maxMetadataSizeMb: string;
  maxTotalSizeMb: string;
}

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

/**
 * Legacy single-enum strategy. It conflated "how do we spread load" with "do we
 * pin a conversation", which is why session stickiness could not be combined
 * with a balancing mode. Kept for reading configs written before `scheduling`.
 */
export type RoutingStrategy = "round-robin" | "fill-first" | "session-sticky";

/** How a group picks among its candidates. Orthogonal to stickiness. */
export type RoutingDistribution = "weighted" | "least-load" | "fill-first";

export type RoutingSticky = {
  enabled: boolean;
  /** Requests one conversation may pin to a single account. Blank = backend default. */
  maxRequests: string;
  /** Release the binding once the account passes this load ratio (0-1). Blank = never. */
  releaseAtLoad: string;
};

export type RoutingScheduling = {
  distribution: RoutingDistribution;
  sticky: RoutingSticky;
};

export type RoutingFallback = "none" | "default";

export type RoutingChannelGroupMatchMode = "channels" | "tags";

export type RoutingChannelGroupMemberEntry = {
  id: string;
  name: string;
  /** Relative share. Blank means the default weight of 1; "0" excludes the channel. */
  priority: string;
};

export type RoutingChannelGroupEntry = {
  id: string;
  name: string;
  description: string;
  /** Legacy mirror kept in sync on save so older backends keep working. */
  strategy: RoutingStrategy;
  scheduling: RoutingScheduling;
  excludeFromDefault?: boolean;
  matchMode?: RoutingChannelGroupMatchMode;
  channels: RoutingChannelGroupMemberEntry[];
  tags?: string[];
  /** Allow list: models added upstream later are rejected unless the group follows upstream. */
  allowedModels: string[];
  /** "All but these", so models added upstream later stay usable. */
  excludedModels?: string[];
  /**
   * `follow-upstream-models` as stored; undefined when never set, which the
   * backend reads as on for the default group and off for every other one.
   * Carried through every save so a whole-config write does not drop it.
   */
  followUpstreamModels?: boolean;
  /**
   * `first-token-timeout-seconds` as stored; undefined when off. A stream with
   * no first token by then is abandoned and, while the client has received
   * nothing, retried on another account. Carried through every save.
   */
  firstTokenTimeoutSeconds?: number;
  /**
   * `busy-wait-max-seconds` as stored. Waiting is opt-in, so undefined and 0
   * are both off, but the two are kept apart: an explicit 0 is the operator's
   * choice and must survive a save. Carried through every save.
   */
  busyWaitMaxSeconds?: number;
  /**
   * Read-only, from GET /channel-groups: what following upstream admits beyond
   * the allow list (served now if the group follows, opened if it is turned on).
   * Shown next to the switch and never written back.
   */
  discoveredModels?: string[];
  system?: boolean;
};

export type RoutingPathRouteEntry = {
  id: string;
  path: string;
  group: string;
  stripPrefix: boolean;
  fallback: RoutingFallback;
};

export type VisualConfigValues = {
  host: string;
  port: string;

  tlsEnable: boolean;
  tlsCert: string;
  tlsKey: string;

  rmAllowRemote: boolean;
  rmSecretKey: string;
  rmDisableControlPanel: boolean;
  rmPanelRepo: string;

  authDir: string;
  corsAllowOriginsText: string;

  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  errorLogsMaxFiles: string;
  usageStatisticsEnabled: boolean;
  requestLog: boolean;
  requestLogStorage: RequestLogStorageVisualConfig;
  systemStatsCacheSeconds: string;
  systemStatsWebSocketMaxAgeSeconds: string;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: "main" | "dev";
  autoUpdateDockerImage: string;

  proxyUrl: string;
  preferIPv4: boolean;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryInterval: string;
  disableCooling: boolean;
  wsAuth: boolean;

  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;

  routingStrategy: RoutingStrategy;
  routingIncludeDefaultGroup: boolean;
  routingChannelGroups: RoutingChannelGroupEntry[];
  routingPathRoutes: RoutingPathRouteEntry[];

  payloadDefaultRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];

  streaming: StreamingConfig;

  kimiHeaderDefaults: {
    userAgent: string;
    platform: string;
    version: string;
  };
};

export const makeClientId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export const DEFAULT_VISUAL_VALUES: VisualConfigValues = {
  host: "",
  port: "",
  tlsEnable: false,
  tlsCert: "",
  tlsKey: "",
  rmAllowRemote: false,
  rmSecretKey: "",
  rmDisableControlPanel: false,
  rmPanelRepo: "",
  authDir: "",
  corsAllowOriginsText: "",
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: "",
  errorLogsMaxFiles: "10",
  usageStatisticsEnabled: false,
  requestLog: false,
  requestLogStorage: {
    storeContent: false,
    retentionDays: "7",
    contentRetentionDays: "3",
    cleanupEnabled: true,
    cleanupIntervalMinutes: "60",
    maxRows: "100000",
    maxMetadataSizeMb: "256",
    maxTotalSizeMb: "128",
  },
  systemStatsCacheSeconds: "60",
  systemStatsWebSocketMaxAgeSeconds: "300",
  autoUpdateEnabled: true,
  autoUpdateChannel: "main",
  autoUpdateDockerImage: "ghcr.io/kittors/clirelay",
  proxyUrl: "",
  preferIPv4: false,
  forceModelPrefix: false,
  requestRetry: "",
  maxRetryInterval: "",
  disableCooling: false,
  wsAuth: false,
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  routingStrategy: "round-robin",
  routingIncludeDefaultGroup: true,
  routingChannelGroups: [],
  routingPathRoutes: [],
  payloadDefaultRules: [],
  payloadOverrideRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: "",
    bootstrapRetries: "",
    nonstreamKeepaliveInterval: "",
  },
  kimiHeaderDefaults: {
    userAgent: "",
    platform: "",
    version: "",
  },
};
