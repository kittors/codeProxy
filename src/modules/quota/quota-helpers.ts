import type { AuthFileItem } from "@/lib/http/types";

export { type AntigravityModelsPayload } from "@/modules/quota/quota-antigravity";
export {
  buildAntigravityGroups,
  buildAntigravityItems,
  parseAntigravityPayload,
} from "@/modules/quota/quota-antigravity";
export { type CodexUsagePayload } from "@/modules/quota/quota-codex";
export {
  buildCodexItems,
  parseCodexUsagePayload,
  resolveCodexChatgptAccountId,
} from "@/modules/quota/quota-codex";
export { type GeminiCliQuotaPayload } from "@/modules/quota/quota-gemini-cli";
export {
  buildGeminiCliBuckets,
  normalizeGeminiCliBucket,
  normalizeGeminiCliModelId,
  parseGeminiCliQuotaPayload,
  resolveGeminiCliProjectId,
} from "@/modules/quota/quota-gemini-cli";
export { type KiroQuotaPayload } from "@/modules/quota/quota-kiro";
export { buildKiroItems, parseKiroQuotaPayload } from "@/modules/quota/quota-kiro";
export { type KimiUsagePayload } from "@/modules/quota/quota-kimi";
export { buildKimiItems, parseKimiUsagePayload } from "@/modules/quota/quota-kimi";
export {
  clampPercent,
  formatRelativeResetLabel,
  isRecord,
  normalizeAuthIndexValue,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseIdTokenPayload,
  parseResetTimeToMs,
  unixSecondsToMs,
} from "@/modules/quota/quota-normalizers";
export type { QuotaItem, QuotaState, QuotaStatus } from "@/modules/quota/quota-types";

export const DEFAULT_ANTIGRAVITY_PROJECT_ID = "bamboo-precept-lgxtn";

export const ANTIGRAVITY_QUOTA_URLS = [
  "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
  "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels",
  "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
];

export const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.11.5 windows/amd64",
};

export const GEMINI_CLI_QUOTA_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
export const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
};

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CODEX_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal",
};

export const KIRO_QUOTA_URL = "https://codewhisperer.us-east-1.amazonaws.com";
export const KIRO_REQUEST_HEADERS = {
  "Content-Type": "application/x-amz-json-1.0",
  "x-amz-target": "AmazonCodeWhispererService.GetUsageLimits",
  Authorization: "Bearer $TOKEN$",
};

export const KIRO_REQUEST_BODY = JSON.stringify({
  origin: "AI_EDITOR",
  resourceType: "AGENTIC_REQUEST",
});

export const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
export const KIMI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
};

export const resolveAuthProvider = (file: AuthFileItem): string => {
  const raw = (file.provider ?? file.type ?? "") as unknown;
  return String(raw).trim().toLowerCase();
};

export const isDisabledAuthFile = (file: AuthFileItem): boolean => {
  const raw = file.disabled as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};
