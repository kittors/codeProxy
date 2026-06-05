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

export interface AuthFileTagDisplayFields {
  default_tags?: string[];
  custom_tags?: string[];
  hidden_default_tags?: string[];
  display_tags?: string[];
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
