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

export interface StreamingConfig {
  keepaliveSeconds: string;
  bootstrapRetries: string;
  nonstreamKeepaliveInterval: string;
}

export type RoutingStrategy = "round-robin" | "fill-first";

export type RoutingFallback = "none" | "default";

export type RoutingChannelGroupMemberEntry = {
  id: string;
  name: string;
  priority: string;
};

export type RoutingChannelGroupEntry = {
  id: string;
  name: string;
  description: string;
  channels: RoutingChannelGroupMemberEntry[];
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
  apiKeysText: string;
  corsAllowOriginsText: string;

  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  usageStatisticsEnabled: boolean;
  autoUpdateEnabled: boolean;
  autoUpdateChannel: "main" | "dev";
  autoUpdateDockerImage: string;

  proxyUrl: string;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryInterval: string;
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
  apiKeysText: "",
  corsAllowOriginsText: "",
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: "",
  usageStatisticsEnabled: false,
  autoUpdateEnabled: true,
  autoUpdateChannel: "main",
  autoUpdateDockerImage: "ghcr.io/kittors/clirelay",
  proxyUrl: "",
  forceModelPrefix: false,
  requestRetry: "",
  maxRetryInterval: "",
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
