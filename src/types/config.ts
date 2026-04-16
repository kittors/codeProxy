/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from "./provider";
import type { AmpcodeConfig } from "./ampcode";

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
}

export interface KimiHeaderDefaults {
  userAgent?: string;
  platform?: string;
  version?: string;
}

export interface RoutingChannelGroupMatch {
  prefixes?: string[];
  channels?: string[];
}

export interface RoutingChannelGroupConfig {
  name?: string;
  description?: string;
  priority?: number;
  match?: RoutingChannelGroupMatch;
}

export interface RoutingPathRouteConfig {
  path?: string;
  group?: string;
  stripPrefix?: boolean;
  fallback?: "none" | "default";
}

export interface RoutingConfig {
  strategy?: string;
  includeDefaultGroup?: boolean;
  channelGroups?: RoutingChannelGroupConfig[];
  pathRoutes?: RoutingPathRouteConfig[];
}

export interface AutoUpdateConfig {
  enabled?: boolean;
  channel?: string;
  repository?: string;
  dockerImage?: string;
  updaterUrl?: string;
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  routing?: RoutingConfig;
  apiKeys?: string[];
  ampcode?: AmpcodeConfig;
  geminiApiKeys?: GeminiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  vertexApiKeys?: ProviderKeyConfig[];
  openaiCompatibility?: OpenAIProviderConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  kimiHeaderDefaults?: KimiHeaderDefaults;
  autoUpdate?: AutoUpdateConfig;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | "debug"
  | "proxy-url"
  | "request-retry"
  | "quota-exceeded"
  | "usage-statistics-enabled"
  | "request-log"
  | "logging-to-file"
  | "logs-max-total-size-mb"
  | "ws-auth"
  | "force-model-prefix"
  | "routing/strategy"
  | "auto-update"
  | "api-keys"
  | "ampcode"
  | "gemini-api-key"
  | "codex-api-key"
  | "claude-api-key"
  | "vertex-api-key"
  | "openai-compatibility"
  | "oauth-excluded-models";

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
