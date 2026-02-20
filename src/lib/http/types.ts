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
  apis: Record<
    string,
    {
      models: Record<
        string,
        {
          details: UsageDetail[];
        }
      >;
    }
  >;
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
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  excludedModels?: string[];
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
