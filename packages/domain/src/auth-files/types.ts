export type AuthFileSubscriptionPeriod = "monthly" | "yearly";

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

export interface AuthFileTagDisplayFields {
  default_tags?: string[];
  custom_tags?: string[];
  hidden_default_tags?: string[];
  display_tags?: string[];
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

export interface AuthFileItem extends AuthFileTagDisplayFields {
  name: string;
  type?: string;
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
  identity_fingerprint_summary?: AuthFileIdentityFingerprintSummary;
  id_token?: unknown;
  attributes?: unknown;
  metadata?: unknown;
  [key: string]: unknown;
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

export interface OAuthModelAliasEntry {
  name: string;
  alias: string;
  fork?: boolean;
}
