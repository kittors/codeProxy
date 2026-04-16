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

export interface IdentityFingerprintConfig {
  codex?: CodexIdentityFingerprint;
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
