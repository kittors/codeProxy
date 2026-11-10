import type { AuthFileItem } from "@code-proxy/api-client";

export {
  ANTIGRAVITY_QUOTA_KEY_PREFIX,
  categorizeAntigravityModel,
  filterAntigravityQuotaItems,
  shouldSkipAntigravityModelId,
  type AntigravityQuotaCategory,
} from "@features/quota-preview/quota-antigravity";
export {
  resolveCodexChatgptAccountId,
  resolveCodexResetCreditCandidates,
} from "@features/quota-preview/quota-codex";
export {
  clampPercent,
  normalizeAuthIndexValue,
  normalizeStringValue,
  parseIdTokenPayload,
} from "@features/quota-preview/quota-normalizers";
export type { QuotaItem, QuotaState } from "@features/quota-preview/quota-types";

export const CODEX_RESET_CREDITS_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
export const CODEX_RESET_CREDITS_CONSUME_URL =
  "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume";
export const CODEX_REQUEST_HEADERS = {
  Authorization: "Bearer $TOKEN$",
  "Content-Type": "application/json",
  "User-Agent": "codex_cli_rs/0.149.1 (Mac OS 26.3.1; arm64) iTerm.app/3.6.9",
  Originator: "Codex Desktop",
  "OpenAI-Beta": "codex-1",
  Accept: "application/json",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Dest": "empty",
};

export const resolveAuthProvider = (file: AuthFileItem): string => {
  const raw = (file.provider ?? file.type ?? "") as unknown;
  const key = String(raw).trim().toLowerCase().replace(/_/g, "-");
  if (key === "x-ai" || key === "grok") return "xai";
  return key;
};
