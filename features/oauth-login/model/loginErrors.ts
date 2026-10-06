import {
  extractApiErrorCode,
  extractApiErrorMessage,
  isApiClientError,
} from "@code-proxy/api-client";

/**
 * What went wrong with a login, in terms the dialog can act on. Each kind maps
 * to copy that tells the operator what to do next instead of echoing the
 * server's English message.
 */
export type LoginProblem =
  | { kind: "expired" }
  | { kind: "superseded" }
  | { kind: "provider_mismatch" }
  | { kind: "invalid_callback" }
  | { kind: "network" }
  | { kind: "failed"; message: string };

const fromMessage = (message: string): LoginProblem | null => {
  if (/superseded|replaced by another/i.test(message)) return { kind: "superseded" };
  if (/expired|unknown or expired state|state not found/i.test(message)) return { kind: "expired" };
  if (/provider does not match/i.test(message)) return { kind: "provider_mismatch" };
  if (/invalid state|state is required|code or error is required/i.test(message)) {
    return { kind: "invalid_callback" };
  }
  return null;
};

const fromCode = (code: string): LoginProblem | null => {
  if (code === "oauth_login_expired") return { kind: "expired" };
  if (code === "oauth_login_superseded") return { kind: "superseded" };
  return null;
};

/** A failed request: starting a login, polling it or submitting its callback. */
export function describeLoginError(error: unknown): LoginProblem {
  if (isApiClientError(error)) {
    const byCode = fromCode(extractApiErrorCode(error.payload));
    if (byCode) return byCode;
    if (error.status === 0 || error.isTimeout) return { kind: "network" };
    const message = extractApiErrorMessage(error.payload, error.message);
    // Older servers answer an unknown or expired state with a bare 404.
    if (error.status === 404) return fromMessage(message) ?? { kind: "expired" };
    return fromMessage(message) ?? { kind: "failed", message };
  }
  if (error instanceof TypeError) return { kind: "network" };
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return fromMessage(message) ?? { kind: "failed", message };
}

/** A status poll that answered `{ status: "error" }`: the login itself failed. */
export function describeStatusError(status: { error?: string; code?: string }): LoginProblem {
  const byCode = status.code ? fromCode(status.code) : null;
  if (byCode) return byCode;
  const message = status.error?.trim() ?? "";
  return fromMessage(message) ?? { kind: "failed", message };
}
