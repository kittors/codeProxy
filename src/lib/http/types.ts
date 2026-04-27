export interface AuthSnapshot {
  apiBase: string;
  managementKey: string;
  rememberPassword: boolean;
}

export type AuthFileType =
  | "qwen"
  | "kimi"
  | "gemini"
  | "gemini-cli"
  | "aistudio"
  | "claude"
  | "codex"
  | "antigravity"
  | "iflow"
  | "vertex"
  | "empty"
  | "unknown";

export interface AuthFileItem {
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  label?: string;
  email?: string;
  plan_type?: string;
  planType?: string;
  account_type?: string;
  account?: string;
  size?: number;
  authIndex?: string | number | null;
  auth_index?: string | number | null;
  runtimeOnly?: boolean | string;
  runtime_only?: boolean | string;
  disabled?: boolean;
  modified?: number;
  modtime?: number;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}

export interface UsageDetail {
  timestamp: string;
  failed: boolean;
  source: string;
  auth_index: string;
  latency_ms?: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  };
}

export interface UsageData {
  total_requests: number;
  success_count: number;
  failure_count: number;
  total_tokens: number;
  apis: Record<
    string,
    {
      total_requests: number;
      total_tokens: number;
      models: Record<
        string,
        {
          total_requests: number;
          total_tokens: number;
        }
      >;
    }
  >;
  requests_by_day: Record<string, number>;
  requests_by_hour: Record<string, number>;
  tokens_by_day: Record<string, number>;
  tokens_by_hour: Record<string, number>;
}

export interface ChartDataResponse {
  daily_series: {
    date: string;
    requests: number;
    failed_requests: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  model_distribution: { model: string; requests: number; tokens: number }[];
  hourly_tokens: {
    hour: string;
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    total_tokens: number;
  }[];
  hourly_models: { hour: string; model: string; requests: number }[];
  apikey_distribution: { api_key: string; name: string; requests: number; tokens: number }[];
}

export interface EntityStatPoint {
  entity_name: string;
  requests: number;
  failed: number;
  avg_latency: number;
  total_tokens: number;
}

export interface EntityStatsResponse {
  source: EntityStatPoint[];
  auth_index: EntityStatPoint[];
}

export interface ProviderModel {
  name?: string;
  alias?: string;
  priority?: number;
  testModel?: string;
}

export interface ProviderApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  proxyId?: string;
  headers?: Record<string, string>;
}

export interface OpenAIProvider {
  name: string;
  baseUrl?: string;
  prefix?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  apiKeyEntries?: ProviderApiKeyEntry[];
  priority?: number;
  testModel?: string;
}

export interface ProviderSimpleConfig {
  apiKey: string;
  name?: string;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  proxyId?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  excludedModels?: string[];
  skipAnthropicProcessing?: boolean;
}

export type OAuthProvider = "codex" | "anthropic" | "antigravity" | "gemini-cli" | "kimi" | "qwen";

export interface OAuthStartResponse {
  url: string;
  state?: string;
}

export interface OAuthCallbackResponse {
  status: "ok";
}

export interface OAuthModelAliasEntry {
  name: string;
  alias: string;
  fork?: boolean;
}

export interface IFlowCookieAuthResponse {
  status: "ok" | "error";
  error?: string;
  saved_path?: string;
  email?: string;
  expired?: string;
  type?: string;
}

export interface LogsQuery {
  after?: number;
  limit?: number;
}

export interface LogsResponse {
  lines: string[];
  "line-count": number;
  "latest-timestamp": number;
}

export interface ErrorLogFile {
  name: string;
  size?: number;
  modified?: number;
}

export interface ErrorLogsResponse {
  files?: ErrorLogFile[];
}

export interface ApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
}

export interface ApiCallResult<T = unknown> {
  statusCode: number;
  header: Record<string, string[]>;
  bodyText: string;
  body: T | null;
}
