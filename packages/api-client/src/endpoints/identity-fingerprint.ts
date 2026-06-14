import { apiClient } from "../client/client";

export interface CodexIdentityFingerprint {
  enabled?: boolean;
  "user-agent"?: string;
  version?: string;
  originator?: string;
  "websocket-beta"?: string;
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

export interface IdentityFingerprintConfig {
  codex?: CodexIdentityFingerprint;
  claude?: ClaudeIdentityFingerprint;
}

export interface IdentityFingerprintResponse {
  "identity-fingerprint": IdentityFingerprintConfig;
  defaults: IdentityFingerprintConfig;
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
  getCodexRecommendations: (params?: { days?: number; limit?: number }) =>
    apiClient.get<CodexFingerprintRecommendationsResponse>(
      "/identity-fingerprint/codex/recommendations",
      { params },
    ),
  update: (payload: IdentityFingerprintConfig) =>
    apiClient.put<{ status: string }>("/identity-fingerprint", payload),
};
