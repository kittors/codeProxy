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

  debug: boolean;
  commercialMode: boolean;
  loggingToFile: boolean;
  logsMaxTotalSizeMb: string;
  usageStatisticsEnabled: boolean;

  proxyUrl: string;
  forceModelPrefix: boolean;
  requestRetry: string;
  maxRetryInterval: string;
  wsAuth: boolean;

  quotaSwitchProject: boolean;
  quotaSwitchPreviewModel: boolean;

  routingStrategy: RoutingStrategy;

  payloadDefaultRules: PayloadRule[];
  payloadOverrideRules: PayloadRule[];
  payloadFilterRules: PayloadFilterRule[];

  streaming: StreamingConfig;
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
  debug: false,
  commercialMode: false,
  loggingToFile: false,
  logsMaxTotalSizeMb: "",
  usageStatisticsEnabled: false,
  proxyUrl: "",
  forceModelPrefix: false,
  requestRetry: "",
  maxRetryInterval: "",
  wsAuth: false,
  quotaSwitchProject: true,
  quotaSwitchPreviewModel: true,
  routingStrategy: "round-robin",
  payloadDefaultRules: [],
  payloadOverrideRules: [],
  payloadFilterRules: [],
  streaming: {
    keepaliveSeconds: "",
    bootstrapRetries: "",
    nonstreamKeepaliveInterval: "",
  },
};
