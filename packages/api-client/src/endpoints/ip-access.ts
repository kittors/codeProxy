import { apiClient } from "../client/client";

export type IpAccessEffect = "allow" | "deny";
export type IpAccessSource = "manual" | "auto";

export interface IpAccessRule {
  id: string;
  cidr: string;
  family: number;
  effect: IpAccessEffect;
  source: IpAccessSource;
  reason: string;
  note: string;
  enabled: boolean;
  expires_at?: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  hit_count: number;
  last_hit_at?: string | null;
}

export interface IpAccessRulesResponse {
  items: IpAccessRule[];
  total: number;
  page: number;
  size: number;
}

export type ProtectedReason =
  | "loopback"
  | "local_address"
  | "trusted_proxy"
  | "outbound_proxy";

export interface ProtectedEntry {
  cidr: string;
  reason: ProtectedReason;
}

/**
 * Whether the list is actually in force. Behind a reverse proxy with no
 * trusted-proxies configured every client reports the proxy's address, so rules
 * are stored and displayed but enforce nothing — `trusted` false is the signal
 * the panel must surface loudly rather than treat as a detail.
 */
export interface IpAccessStatus {
  client_ip: string;
  trusted: boolean;
  relay_header: string;
  trusted_proxies_configured: boolean;
  enforced: boolean;
  lockdown: boolean;
  active_rules: number;
  storage_available: boolean;
  auto_ban_mode: AutoBanMode;
  suggested_trusted_proxies?: string[];
  self_allowed?: boolean;
  suggested_self_rule?: string;
  dropped_events?: number;
  /** Addresses no rule may ever deny (host, reverse proxy, egress proxies). */
  protected?: ProtectedEntry[];
}

export type AutoBanMode = "off" | "observe" | "enforce";

export interface AutoBanPolicy {
  mode: AutoBanMode;
  window_seconds: number;
  failure_threshold: number;
  ban_minutes: number;
  max_ban_minutes: number;
}

export interface ThrottleOverride {
  login_failure_window_seconds: number;
  account_failure_limit: number;
  management_key_failure_limit: number;
  unauthenticated_request_limit: number;
  failure_reset_hours: number;
}

export interface ProtectionPolicy {
  lockdown: boolean;
  auto_ban: AutoBanPolicy;
  throttle: ThrottleOverride;
}

/** Effective limits as the running limiter sees them, not as configured. */
export interface ThrottleScopeView {
  scope: string;
  short_limit: number;
  short_window: string;
  long_limit: number;
  long_window: string;
  backoff: string[];
  reset_after: string;
  hard_block: boolean;
  key_dimension: "client_ip" | "username";
}

export interface ProtectionPolicyResponse {
  policy: ProtectionPolicy;
  throttle: ThrottleScopeView[];
}

export type AuthAttemptOutcome =
  | "success"
  | "failure"
  | "throttled"
  | "blocked"
  | "auto_banned"
  | "would_ban";

export interface AuthAttempt {
  id: number;
  occurred_at: string;
  ip: string;
  ip_prefix: string;
  trusted: boolean;
  scope: string;
  surface: string;
  username: string;
  outcome: AuthAttemptOutcome;
  reason: string;
  user_agent: string;
  request_path: string;
  request_id: string;
  tenant_id?: string;
}

export interface AuthAttemptsResponse {
  items: AuthAttempt[];
  total: number;
  page: number;
  size: number;
}

export interface AuthSourceSummary {
  ip_prefix: string;
  sample_ip: string;
  trusted: boolean;
  attempts: number;
  failures: number;
  throttled: number;
  blocked: number;
  successes: number;
  distinct_usernames: number;
  first_seen: string;
  last_seen: string;
  surfaces: string;
  rule_effect?: string;
  rule_id?: string;
  rule_expires_at?: string | null;
}

export interface AuthSummaryResponse {
  items: AuthSourceSummary[];
  window: string;
}

export type AuthAttemptWindow = "1h" | "6h" | "24h" | "7d";

export interface CreateIpAccessRuleBody {
  cidr: string;
  effect: IpAccessEffect;
  note?: string;
  reason?: string;
  expires_at?: string;
}

export interface UpdateIpAccessRuleBody {
  enabled?: boolean;
  note?: string;
  /** Empty string clears the expiry, making the rule permanent. */
  expires_at?: string;
}

export const ipAccessApi = {
  rules: (params?: {
    effect?: IpAccessEffect | "";
    source?: IpAccessSource | "";
    enabled?: boolean;
    search?: string;
    page?: number;
    size?: number;
  }) =>
    apiClient.get<IpAccessRulesResponse>("/ip-access/rules", {
      params: {
        effect: params?.effect || undefined,
        source: params?.source || undefined,
        enabled: params?.enabled,
        search: params?.search || undefined,
        page: params?.page ?? 1,
        size: params?.size ?? 50,
      },
    }),
  createRule: (body: CreateIpAccessRuleBody) =>
    apiClient.post<{ rule: IpAccessRule; warning?: string }>("/ip-access/rules", body),
  updateRule: (id: string, body: UpdateIpAccessRuleBody) =>
    apiClient.patch<{ rule: IpAccessRule }>(`/ip-access/rules/${encodeURIComponent(id)}`, body),
  deleteRule: (id: string) =>
    apiClient.delete<void>(`/ip-access/rules/${encodeURIComponent(id)}`),
  status: () => apiClient.get<IpAccessStatus>("/ip-access/status"),
  policy: () => apiClient.get<ProtectionPolicyResponse>("/ip-access/policy"),
  updatePolicy: (body: ProtectionPolicy) =>
    apiClient.put<ProtectionPolicyResponse>("/ip-access/policy", body),
  attempts: (params?: {
    ip?: string;
    username?: string;
    outcome?: string;
    surface?: string;
    window?: AuthAttemptWindow;
    page?: number;
    size?: number;
  }) =>
    apiClient.get<AuthAttemptsResponse>("/auth-attempts", {
      params: {
        ip: params?.ip || undefined,
        username: params?.username || undefined,
        outcome: params?.outcome || undefined,
        surface: params?.surface || undefined,
        window: params?.window || undefined,
        page: params?.page ?? 1,
        size: params?.size ?? 50,
      },
    }),
  summary: (params?: { window?: AuthAttemptWindow; limit?: number }) =>
    apiClient.get<AuthSummaryResponse>("/auth-attempts/summary", {
      params: {
        window: params?.window ?? "24h",
        limit: params?.limit ?? 50,
      },
    }),
};
