import { apiCallApi, getApiCallErrorMessage } from "@code-proxy/api-client";
import type { AuthFileItem } from "@code-proxy/api-client";
import {
  CODEX_REQUEST_HEADERS,
  CODEX_RESET_CREDITS_URL,
  CODEX_RESET_CREDITS_CONSUME_URL,
  normalizeAuthIndexValue,
  normalizeStringValue,
  resolveAuthProvider,
  resolveCodexChatgptAccountId,
  resolveCodexResetCreditCandidates,
} from "@features/quota-preview/quota-helpers";

/**
 * Quota itself is probed by the backend: the AI accounts page starts a status
 * refresh job (CliRelay internal/management/aiaccountstatus), and that probe
 * owns each upstream's URLs and client identity, such as the Grok CLI version.
 * The panel's own per-provider quota fetchers sat unused after the page moved
 * to that job and kept identities that had gone stale (Grok 0.2.91), so they
 * were removed rather than kept in step. Only the Codex reset-credit action
 * below still calls an upstream through api-call.
 */
export type QuotaProvider =
  | "antigravity"
  | "claude"
  | "codex"
  | "gemini-cli"
  | "kimi"
  | "kiro"
  | "xai";

const createRedeemRequestId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
  );

const resolveAuthIndex = (file: AuthFileItem): string => {
  const rawAuthIndex = file.auth_index ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) throw new Error("missing_auth_index");
  return authIndex;
};

const buildCodexRequestHeaders = (file: AuthFileItem): Record<string, string> => {
  const accountId = resolveCodexChatgptAccountId(file);
  const requestHeader: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
  };
  if (accountId) {
    requestHeader["Chatgpt-Account-Id"] = accountId;
  }
  return requestHeader;
};

export const resolveQuotaProvider = (file: AuthFileItem): QuotaProvider | null => {
  const provider = resolveAuthProvider(file);
  if (provider === "antigravity") return "antigravity";
  if ((provider === "anthropic" || provider === "claude") && isClaudeOAuthLikeFile(file))
    return "claude";
  if (provider === "codex") return "codex";
  if (provider === "gemini-cli") return "gemini-cli";
  if (provider === "kimi") return "kimi";
  if (provider === "kiro") return "kiro";
  if (provider === "xai") return "xai";
  return null;
};

export const consumeCodexResetCredit = async (
  file: AuthFileItem,
  options?: { creditId?: string },
): Promise<void> => {
  const authIndex = resolveAuthIndex(file);
  const header = buildCodexRequestHeaders(file);

  let targetCreditId = options?.creditId;
  if (!targetCreditId) {
    // FIFO: query candidate credits to pick the earliest expiring credit if available
    try {
      const details = await apiCallApi.request({
        authIndex,
        method: "GET",
        url: CODEX_RESET_CREDITS_URL,
        header,
      });
      if (details.statusCode >= 200 && details.statusCode < 300) {
        const candidates = resolveCodexResetCreditCandidates(details.body ?? details.bodyText);
        if (candidates.length > 0 && candidates[0]?.id) {
          targetCreditId = candidates[0].id;
        }
      }
    } catch {
      // Fall back to untargeted reset if candidates query fails
    }
  }

  const payload: Record<string, string> = {
    redeem_request_id: createRedeemRequestId(),
  };
  if (targetCreditId) {
    payload.credit_id = targetCreditId;
  }

  const result = await apiCallApi.request({
    authIndex,
    method: "POST",
    url: CODEX_RESET_CREDITS_CONSUME_URL,
    header,
    data: JSON.stringify(payload),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }
};

const isClaudeOAuthLikeFile = (file: AuthFileItem): boolean => {
  const accountType = normalizeStringValue(file.account_type ?? file.accountType)?.toLowerCase();
  if (accountType === "api-key" || accountType === "apikey" || accountType === "api_key") {
    return false;
  }
  return true;
};
