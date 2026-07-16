export interface AuthSnapshot {
  apiBase: string;
  managementKey: string;
  rememberPassword: boolean;
  /** Platform-admin override; empty/omitted means home tenant (no X-Effective-Tenant-ID). */
  effectiveTenantId?: string;
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
  | "xai"
  | "iflow"
  | "vertex"
  | "empty"
  | "unknown";

export type AuthFileSubscriptionPeriod = "monthly" | "yearly";

export interface TagDisplayFields {
  default_tags?: string[];
  custom_tags?: string[];
  hidden_default_tags?: string[];
  display_tags?: string[];
}

export interface AuthFileRestriction {
  scope?: "auth" | "model" | string;
  model?: string;
  status?: string;
  status_message?: string;
  unavailable?: boolean;
  http_status?: number;
  code?: string;
  reason?: string;
  quota_window?: string;
  quota_window_minutes?: number;
  quota_exceeded?: boolean;
  retryable?: boolean;
  next_retry_after?: string | number;
  next_recover_at?: string | number;
}

export interface ClaudeOAuthHealthWindow {
  status?: string;
  reset_at?: string;
  utilization?: number;
  exceeded?: boolean;
  surpassed_threshold?: boolean;
  updated_at?: string;
}

export interface ClaudeOAuthRuntimeProfile {
  name?: string;
  identity_fingerprint?: string;
  transport?: string;
  egress?: string;
}

export interface ClaudeOAuthHealth {
  enabled?: boolean;
  status?: string;
  updated_at?: string;
  refresh_available?: boolean;
  last_runtime_status?: number;
  last_runtime_at?: string;
  last_refresh_at?: string;
  last_401_at?: string;
  last_401_message?: string;
  temporary_unschedulable_until?: string;
  temporary_unschedulable_reason?: string;
  windows?: {
    five_hour?: ClaudeOAuthHealthWindow;
    seven_day?: ClaudeOAuthHealthWindow;
  };
  runtime_profile?: ClaudeOAuthRuntimeProfile;
}

export interface AuthFileCodexAllowedClientPresetInfo {
  id: string;
  label: string;
  description?: string;
}

export interface AuthFileCodexOAuthAdmission {
  enabled?: boolean;
  allowed_clients?: string[];
  available_allowed_clients?: AuthFileCodexAllowedClientPresetInfo[];
}

export interface AuthFileCodexImageGenerationBridge {
  enabled?: boolean;
}

export type AuthFileIdentityFingerprintProvider = "claude" | "codex" | "gemini" | "xai";
export type AuthFileIdentityFingerprintSource = "learned" | "preset" | "builtin_default";

export interface AuthFileIdentityFingerprintSummary {
  provider: AuthFileIdentityFingerprintProvider;
  account_key?: string;
  auth_subject_id?: string;
  enabled: boolean;
  primary_source: AuthFileIdentityFingerprintSource;
  learned: boolean;
  learned_fields: number;
  effective_fields: number;
  source_counts: Partial<Record<AuthFileIdentityFingerprintSource, number>>;
  profile_key?: string;
  profile_family?: string;
  client_product?: string;
  client_variant?: string;
  version?: string;
  updated_at?: string;
  last_seen_at?: string;
}

export interface AuthFileItem extends TagDisplayFields {
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
  /** Canonical subject id shared by multi-file accounts (status merge key). */
  auth_subject_id?: string | null;
  authSubjectId?: string | null;
  runtimeOnly?: boolean | string;
  runtime_only?: boolean | string;
  disabled?: boolean;
  status?: string;
  status_message?: string;
  unavailable?: boolean;
  next_retry_after?: string | number;
  restrictions?: AuthFileRestriction[];
  modified?: number;
  modtime?: number;
  subscription_started_at?: string;
  subscriptionStartedAt?: string;
  subscription_start_at?: string;
  subscriptionStartAt?: string;
  subscription_started_at_ms?: number;
  subscriptionStartedAtMs?: number;
  subscription_period?: AuthFileSubscriptionPeriod | string;
  subscriptionPeriod?: AuthFileSubscriptionPeriod | string;
  subscription_expires_at?: string;
  subscriptionExpiresAt?: string;
  subscription_expires_at_ms?: number;
  subscriptionExpiresAtMs?: number;
  subscription_remaining_minutes?: number;
  subscriptionRemainingMinutes?: number;
  subscription_expired?: boolean;
  subscriptionExpired?: boolean;
  claude_oauth_health?: ClaudeOAuthHealth;
  codex_oauth_admission?: AuthFileCodexOAuthAdmission;
  codex_image_generation_bridge?: AuthFileCodexImageGenerationBridge;
  identity_fingerprint_summary?: AuthFileIdentityFingerprintSummary;
  codex_cli_only?: boolean;
  codex_cli_only_allowed_clients?: string[];
  /** xAI OAuth: true = official API quota, false = Grok Build/CLI subscription. */
  using_api?: boolean;
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
  disabled?: boolean;
  proxyUrl?: string;
  proxyId?: string;
  headers?: Record<string, string>;
}

export interface OpenAIProvider {
  name: string;
  disabled?: boolean;
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
  disabled?: boolean;
  name?: string;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  proxyId?: string;
  headers?: Record<string, string>;
  models?: ProviderModel[];
  excludedModels?: string[];
  visionFallbackModel?: string;
  workspaceId?: string;
  authCookie?: string;
  skipAnthropicProcessing?: boolean;
}

export interface OpenCodeGoUsageItem {
  type: "rolling" | "weekly" | "monthly" | string;
  label: string;
  percentage: number;
  resets_in: string;
}

export interface OpenCodeGoUsageResponse {
  workspace_id?: string;
  usage: OpenCodeGoUsageItem[];
}

export type BedrockAuthMode = "api-key" | "sigv4";

export interface BedrockProviderConfig extends ProviderSimpleConfig {
  authMode: BedrockAuthMode;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  forceGlobal?: boolean;
}

export type OAuthProvider =
  | "codex"
  | "anthropic"
  | "antigravity"
  | "xai"
  | "gemini-cli"
  | "kimi"
  | "qwen";

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
  request_id?: string;
  status?: number;
  error_code?: string;
  error_type?: string;
  original_url?: string;
  effective_url?: string;
  route_group?: string;
  route_path?: string;
  model?: string;
  provider?: string;
  upstream_status?: number;
  rejected_by?: string;
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

/** Backend AccountStatusView quota item (authoritative). */
export interface AiAccountQuotaItemDto {
  quota_key: string;
  quota_label?: string;
  percent?: number | null;
  reset_at?: string | null;
  window_seconds?: number | null;
  /** Optional display value (xai / Gemini / Kiro cards). */
  value?: string;
  /** Optional secondary meta text. */
  meta?: string;
}

/** Backend AccountStatusView usage summary (authoritative). */
export interface AiAccountUsageSummaryDto {
  auth_subject_id?: string;
  request_total_7d?: number | null;
  cost_total_7d?: number | null;
  request_total_30d?: number | null;
  success_total_30d?: number | null;
  failure_total_30d?: number | null;
  cycle_request_total?: number | null;
  cycle_cost_total?: number | null;
  cycle_known?: boolean;
  cycle_start?: string | null;
  weekly_quota_used_percent?: number | null;
  updated_at?: string | null;
}

/**
 * Backend currently returns restriction_summary as a plain string.
 * Keep optional structured fields only if a future backend emits an object.
 */
export type AiAccountRestrictionSummaryDto = string;

/** Backend AccountStatusView (authoritative read model). */
export interface AiAccountLatestStatusDto {
  auth_subject_id?: string;
  auth_index: string;
  provider?: string;
  refresh_state?: string;
  health_status?: string;
  plan_type?: string | null;
  /** Authoritative: string summary from backend. */
  restriction_summary?: string | null;
  error_summary?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  quotas: AiAccountQuotaItemDto[];
  usage?: AiAccountUsageSummaryDto | null;
  /** Optional Codex reset-credit fields retained by backend. */
  reset_credit_count?: number | null;
  reset_credit_expirations?: string[];
  upstream_checked_at?: string | null;
  usage_updated_at?: string | null;
  expires_at?: string | null;
  version?: number | string | null;
  updated_at?: string | null;
}

/** GET /ai-accounts/status */
export interface AiAccountsStatusSnapshotDto {
  items: AiAccountLatestStatusDto[];
}

/** POST /ai-accounts/status-refresh */
export interface AiAccountStatusRefreshRequest {
  auth_indexes: string[];
  force: boolean;
}

export interface AiAccountStatusRefreshAcceptedDto {
  job_id: string;
  accepted: number;
  deduplicated: number;
  /** Auth indexes skipped by the backend (not a count). */
  skipped?: string[];
}

export type AiAccountStatusRefreshJobState = "running" | "completed";

export type AiAccountStatusRefreshAccountState =
  | "queued"
  | "running"
  | "success"
  | "error";

export interface AiAccountStatusRefreshAccountResultDto {
  auth_index: string;
  auth_subject_id?: string;
  state: AiAccountStatusRefreshAccountState;
  error_code?: string | null;
  error_message?: string | null;
  updated_at?: string | null;
  result?: AiAccountLatestStatusDto | null;
}

/** GET /ai-accounts/status-refresh/:job_id */
export interface AiAccountStatusRefreshJobDto {
  job_id: string;
  tenant_id?: string;
  state: AiAccountStatusRefreshJobState;
  total: number;
  completed: number;
  failed: number;
  created_at?: string | null;
  updated_at?: string | null;
  results: AiAccountStatusRefreshAccountResultDto[];
}
