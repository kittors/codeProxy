import { apiClient } from "@/lib/http/client";

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

export const identityFingerprintApi = {
  get: () => apiClient.get<IdentityFingerprintResponse>("/identity-fingerprint"),
  update: (payload: IdentityFingerprintConfig) =>
    apiClient.put<{ status: string }>("/identity-fingerprint", payload),
};
