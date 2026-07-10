import { apiClient, type RequestOptions } from "../client/client";

export interface CodexIdentityFingerprint {
  enabled?: boolean;
  "user-agent"?: string;
  version?: string;
  originator?: string;
  "websocket-beta"?: string;
  "x-codex-beta-features"?: string;
  "session-mode"?: "server-stable" | "fixed" | "per-request";
  "session-id"?: string;
  "custom-headers"?: Record<string, string>;
}

export interface ClaudeIdentityFingerprint {
  enabled?: boolean;
  "cli-version"?: string;
  entrypoint?: string;
  "user-agent"?: string;
  "anthropic-beta"?: string;
  "stainless-package-version"?: string;
  "stainless-runtime-version"?: string;
  "stainless-timeout"?: string;
  "session-mode"?: "server-stable" | "fixed" | "per-request";
  "session-id"?: string;
  "device-id"?: string;
  "custom-headers"?: Record<string, string>;
}

export interface GeminiIdentityFingerprint {
  enabled?: boolean;
  "user-agent"?: string;
  "x-goog-api-client"?: string;
  "client-metadata"?: string;
  "custom-headers"?: Record<string, string>;
}

export interface XAIIdentityFingerprint {
  enabled?: boolean;
  "user-agent"?: string;
  "x-grok-client-identifier"?: string;
  "x-grok-client-version"?: string;
  "x-grok-conv-id"?: string;
  "custom-headers"?: Record<string, string>;
}

export interface IdentityFingerprintConfig {
  codex?: CodexIdentityFingerprint;
  claude?: ClaudeIdentityFingerprint;
  gemini?: GeminiIdentityFingerprint;
  xai?: XAIIdentityFingerprint;
}

export type IdentityFingerprintProvider = "claude" | "codex" | "gemini" | "xai";
export type IdentityFingerprintFieldSource = "learned" | "preset" | "builtin_default";

export interface IdentityFingerprintFieldValue {
  value: string;
  source: IdentityFingerprintFieldSource;
}

export interface IdentityFingerprintLearnedRecord {
  provider: IdentityFingerprintProvider;
  account_key: string;
  auth_subject_id?: string;
  client_product?: string;
  client_variant?: string;
  version?: string;
  fields: Record<string, string>;
  observed_headers?: Record<string, string>;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface IdentityFingerprintEffectiveRecord {
  provider: IdentityFingerprintProvider;
  account_key?: string;
  auth_subject_id?: string;
  enabled: boolean;
  client_product?: string;
  version?: string;
  fields: Record<string, IdentityFingerprintFieldValue>;
  learned?: IdentityFingerprintLearnedRecord;
}

export interface IdentityFingerprintProviderStatus {
  enabled: boolean;
  learned_count: number;
}

export interface IdentityFingerprintResponse {
  "identity-fingerprint": IdentityFingerprintConfig;
  defaults: IdentityFingerprintConfig;
  learned?: Partial<Record<IdentityFingerprintProvider, IdentityFingerprintLearnedRecord[]>>;
  effective?: Partial<Record<IdentityFingerprintProvider, IdentityFingerprintEffectiveRecord[]>>;
  status?: Partial<Record<IdentityFingerprintProvider, IdentityFingerprintProviderStatus>>;
}

export interface IdentityFingerprintAccountSummary {
  provider: IdentityFingerprintProvider;
  account_key?: string;
  auth_subject_id?: string;
  enabled: boolean;
  primary_source: IdentityFingerprintFieldSource;
  learned: boolean;
  learned_fields: number;
  effective_fields: number;
  source_counts: Partial<Record<IdentityFingerprintFieldSource, number>>;
  client_product?: string;
  client_variant?: string;
  version?: string;
  updated_at?: string;
  last_seen_at?: string;
}

export interface IdentityFingerprintAccountDetail {
  summary: IdentityFingerprintAccountSummary;
  effective: IdentityFingerprintEffectiveRecord;
  learned?: IdentityFingerprintLearnedRecord;
  preset?: unknown;
  builtin_default?: unknown;
}

export interface CodexFingerprintRecommendationSample {
  log_id: number;
  timestamp: string;
  model: string;
  source: string;
  channel_name: string;
  auth_index: string;
  failed: boolean;
  method?: string;
  path?: string;
  host?: string;
  ip?: string;
}

export interface CodexFingerprintRecommendation {
  id: string;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  headers: Record<string, string>;
  recommended: CodexIdentityFingerprint;
  ignored_headers?: Record<string, string>;
  samples: CodexFingerprintRecommendationSample[];
}

export interface CodexFingerprintRecommendationsResponse {
  items: CodexFingerprintRecommendation[];
  days: number;
  limit: number;
  inspected: number;
  matched: number;
}

export const identityFingerprintApi = {
  get: () => apiClient.get<IdentityFingerprintResponse>("/identity-fingerprint"),
  getAccountDetail: (
    params: {
      provider: IdentityFingerprintProvider;
      account_key: string;
      auth_subject_id?: string;
    },
    options?: Omit<RequestOptions, "params">,
  ) =>
    apiClient.get<IdentityFingerprintAccountDetail>("/identity-fingerprint/account", {
      ...options,
      params,
    }),
  getCodexRecommendations: (
    params?: { days?: number; limit?: number },
    options?: Omit<RequestOptions, "params">,
  ) =>
    apiClient.get<CodexFingerprintRecommendationsResponse>(
      "/identity-fingerprint/codex/recommendations",
      { ...options, params },
    ),
  update: (payload: IdentityFingerprintConfig) =>
    apiClient.put<{ status: string }>("/identity-fingerprint", payload),
  deleteLearned: (provider: IdentityFingerprintProvider, accountKey: string) =>
    apiClient.delete<{ deleted: number }>("/identity-fingerprint/learned", undefined, {
      params: { provider, account_key: accountKey },
    }),
};
