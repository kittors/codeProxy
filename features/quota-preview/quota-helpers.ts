import type { AuthFileItem } from "@code-proxy/api-client";

export { type AntigravityModelsPayload } from "@features/quota-preview/quota-antigravity";
export {
  ANTIGRAVITY_QUOTA_KEY_PREFIX,
  buildAntigravityGroups,
  buildAntigravityItems,
  buildAntigravitySummaryItems,
  categorizeAntigravityModel,
  filterAntigravityQuotaItems,
  parseAntigravityForwardingRules,
  parseAntigravityPayload,
  parseAntigravityWindowSeconds,
  shouldSkipAntigravityModelId,
  summarizeAntigravityQuotaItems,
  type AntigravityQuotaCategory,
} from "@features/quota-preview/quota-antigravity";
export { type CodexUsagePayload } from "@features/quota-preview/quota-codex";
export {
  buildCodexItems,
  parseCodexUsagePayload,
  resolveCodexResetCreditExpirations,
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
export { type XaiBillingPayload, type XaiBillingSummary } from "@features/quota-preview/quota-xai";
export {
  buildXaiBillingSummary,
  buildXaiItems,
  mergeXaiBillingSummaries,
  parseXaiBillingPayload,
  resolveXaiPlanType,
  resolveXaiUserId,
} from "@features/quota-preview/quota-xai";
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

/**
 * The shared project the upstream accepts for accounts that have none of their
 * own. It is a last resort, not a default: asking for quota under a project that
 * is not yours reports that project's remaining fraction, which is how an
 * exhausted account comes back reading 100%.
 */
export const DEFAULT_ANTIGRAVITY_PROJECT_ID = "bamboo-precept-lgxtn";

/**
 * Ordered sandbox-first: the sandbox host stays reachable while the production
 * host is shedding load with 429s.
 */
const ANTIGRAVITY_HOSTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
];

/**
 * The grouped view. The upstream reports one bucket per model family per window
 * (weekly and 5h) and names them itself, so nothing here has to guess which
 * models share a quota.
 */
export const ANTIGRAVITY_QUOTA_SUMMARY_URLS = ANTIGRAVITY_HOSTS.map(
  (host) => `${host}/v1internal:retrieveUserQuotaSummary`,
);

/** The flat view. Only carries the 5h window and leaves grouping to the caller. */
export const ANTIGRAVITY_QUOTA_URLS = ANTIGRAVITY_HOSTS.map(
  (host) => `${host}/v1internal:fetchAvailableModels`,
);

export const ANTIGRAVITY_LOAD_CODE_ASSIST_URLS = ANTIGRAVITY_HOSTS.map(
  (host) => `${host}/v1internal:loadCodeAssist`,
);

/**
 * The client version the upstream gates its answer on. An outdated version is
 * served a reduced model set and a coarser quota view, so this must track the
 * real Antigravity client rather than whatever version happened to be current
 * when the header was first written.
 *
 * The literal `1.X.X` is not an unfilled placeholder — that is the string the
 * Antigravity client itself sends.
 */
export const ANTIGRAVITY_CLIENT_VERSION = "4.3.0";

export const ANTIGRAVITY_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": `vscode/1.X.X (Antigravity/${ANTIGRAVITY_CLIENT_VERSION})`,
};

export const GEMINI_CLI_QUOTA_URL =
  "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota";
export const GEMINI_CLI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
};

export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export const CODEX_RESET_CREDITS_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
export const CODEX_RESET_CREDITS_CONSUME_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume";
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

export const XAI_BILLING_WEEKLY_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const XAI_BILLING_MONTHLY_URL = "https://cli-chat-proxy.grok.com/v1/billing";
export const XAI_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "x-xai-token-auth": "xai-grok-cli",
  "x-grok-client-version": "0.2.91",
  accept: "*/*",
  "user-agent": "grok-pager/0.2.91 grok-shell/0.2.91 (macos; aarch64)",
};

export const resolveAuthProvider = (file: AuthFileItem): string => {
  const raw = (file.provider ?? file.type ?? "") as unknown;
  const key = String(raw).trim().toLowerCase().replace(/_/g, "-");
  if (key === "x-ai" || key === "grok") return "xai";
  return key;
};

export const isDisabledAuthFile = (file: AuthFileItem): boolean => {
  const raw = file.disabled as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};
