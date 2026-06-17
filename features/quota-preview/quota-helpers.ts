import type { AuthFileItem } from "@code-proxy/api-client";

export { type AntigravityModelsPayload } from "@features/quota-preview/quota-antigravity";
export {
  buildAntigravityGroups,
  buildAntigravityItems,
  filterAntigravityQuotaItems,
  parseAntigravityPayload,
  shouldSkipAntigravityModelId,
} from "@features/quota-preview/quota-antigravity";
export { type CodexUsagePayload } from "@features/quota-preview/quota-codex";
export {
  buildCodexItems,
  parseCodexUsagePayload,
  resolveCodexResetCreditCount,
  resolveCodexChatgptAccountId,
} from "@features/quota-preview/quota-codex";
export { type ClaudeUsagePayload } from "@features/quota-preview/quota-claude";
export { buildClaudeItems, parseClaudeUsagePayload } from "@features/quota-preview/quota-claude";
export { type GeminiCliQuotaPayload } from "@features/quota-preview/quota-gemini-cli";
export {
  buildGeminiCliBuckets,
  normalizeGeminiCliBucket,
  normalizeGeminiCliModelId,
  parseGeminiCliQuotaPayload,
  resolveGeminiCliProjectId,
} from "@features/quota-preview/quota-gemini-cli";
export { type KiroQuotaPayload } from "@features/quota-preview/quota-kiro";
export { buildKiroItems, parseKiroQuotaPayload } from "@features/quota-preview/quota-kiro";
export { type KimiUsagePayload } from "@features/quota-preview/quota-kimi";
export { buildKimiItems, parseKimiUsagePayload } from "@features/quota-preview/quota-kimi";
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
} from "@features/quota-preview/quota-normalizers";
export type { QuotaItem, QuotaState, QuotaStatus } from "@features/quota-preview/quota-types";

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

export const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
export const CLAUDE_REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "claude-code/2.1.7",
  "anthropic-beta": "oauth-2025-04-20",
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
