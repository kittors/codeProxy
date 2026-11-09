import type { AuthFileItem } from "@code-proxy/api-client";
import {
  isRecord,
  normalizeStringValue,
  parseIdTokenPayload,
} from "@features/quota-preview/quota-normalizers";

export const resolveCodexChatgptAccountId = (file: AuthFileItem): string | null => {
  const metadata = isRecord(file.metadata) ? (file.metadata as Record<string, unknown>) : null;
  const attributes = isRecord(file.attributes)
    ? (file.attributes as Record<string, unknown>)
    : null;
  const directCandidates = [
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file.account_id,
    file.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    metadata?.account_id,
    metadata?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId,
  ];
  for (const candidate of directCandidates) {
    const id = normalizeStringValue(candidate);
    if (id) return id;
  }

  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];
  for (const candidate of candidates) {
    const payload = parseIdTokenPayload(candidate);
    if (!payload) continue;
    const directId = normalizeStringValue(
      payload.chatgpt_account_id ??
        payload.chatgptAccountId ??
        payload.account_id ??
        payload.accountId,
    );
    if (directId) return directId;
    const nestedAuth = isRecord(payload["https://api.openai.com/auth"])
      ? (payload["https://api.openai.com/auth"] as Record<string, unknown>)
      : null;
    const nestedId = nestedAuth
      ? normalizeStringValue(
          nestedAuth.chatgpt_account_id ??
            nestedAuth.chatgptAccountId ??
            nestedAuth.account_id ??
            nestedAuth.accountId,
        )
      : null;
    if (nestedId) return nestedId;
  }
  return null;
};

const parseCodexResetCreditsPayload = (payload: unknown): unknown => {
  if (typeof payload !== "string") return payload;
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
};

const readCodexResetCreditList = (payload: unknown, depth = 0): unknown[] => {
  const parsed = parseCodexResetCreditsPayload(payload);
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [];
  for (const key of [
    "credits",
    "rate_limit_reset_credits",
    "rateLimitResetCredits",
    "items",
    "data",
  ]) {
    const value = parsed[key];
    if (Array.isArray(value) && value.length > 0) return value;
    if (depth < 1 && isRecord(value)) {
      const nested = readCodexResetCreditList(value, depth + 1);
      if (nested.length > 0) return nested;
    }
  }
  return [];
};

export type CodexResetCreditCandidate = {
  id?: string;
  expiresAt?: string;
};

export const resolveCodexResetCreditCandidates = (payload: unknown): CodexResetCreditCandidate[] => {
  const rawList = readCodexResetCreditList(payload);
  const items: CodexResetCreditCandidate[] = [];
  for (const credit of rawList) {
    if (!isRecord(credit)) continue;
    const id = normalizeStringValue(credit.id ?? credit.credit_id ?? credit.creditId) ?? undefined;
    const expiresAt = normalizeStringValue(credit.expires_at ?? credit.expiresAt) ?? undefined;
    const resetType = normalizeStringValue(credit.reset_type ?? credit.resetType);
    if (resetType && resetType.toLowerCase() !== "codex_rate_limits") continue;
    const status = normalizeStringValue(credit.status);
    if (status && status.toLowerCase() !== "available") continue;
    items.push({ id, expiresAt });
  }
  return items.sort((left, right) => {
    const leftMs = left.expiresAt ? Date.parse(left.expiresAt) : Number.POSITIVE_INFINITY;
    const rightMs = right.expiresAt ? Date.parse(right.expiresAt) : Number.POSITIVE_INFINITY;
    const leftSort = Number.isNaN(leftMs) ? Number.POSITIVE_INFINITY : leftMs;
    const rightSort = Number.isNaN(rightMs) ? Number.POSITIVE_INFINITY : rightMs;
    if (leftSort === rightSort) return 0;
    return leftSort < rightSort ? -1 : 1;
  });
};
