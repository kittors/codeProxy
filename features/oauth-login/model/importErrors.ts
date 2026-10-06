import { extractApiErrorCode, extractApiErrorMessage, isApiClientError } from "@code-proxy/api-client";

/**
 * Why a credential import failed, in terms the panel can act on. The server
 * sends a stable code with every failure; it is mapped here so the operator
 * reads what to do next ("this session key has expired") rather than the
 * upstream's raw English.
 */
export type ImportProblem =
  | { kind: "unsupported" } // 404: the backend predates credential import
  | { kind: "credential_required" }
  | { kind: "credential_unrecognized" } // pasted into the wrong field
  | { kind: "credential_invalid" } // upstream rejected it (expired / revoked)
  | { kind: "no_organization" }
  | { kind: "authorization_denied" }
  | { kind: "upstream_blocked" } // a challenge: about our egress, not the key
  | { kind: "upstream_timeout" }
  | { kind: "save_failed" }
  | { kind: "network" }
  | { kind: "failed"; message: string };

const CODE_MAP: Record<string, ImportProblem["kind"]> = {
  request_invalid: "credential_required",
  credential_required: "credential_required",
  credential_unrecognized: "credential_unrecognized",
  credential_invalid: "credential_invalid",
  no_organization: "no_organization",
  authorization_denied: "authorization_denied",
  upstream_blocked: "upstream_blocked",
  upstream_timeout: "upstream_timeout",
  upstream_error: "failed",
  save_failed: "save_failed",
};

export function describeImportError(error: unknown): ImportProblem {
  if (isApiClientError(error)) {
    if (error.status === 404) return { kind: "unsupported" };
    if (error.status === 0 || error.isTimeout) return { kind: "network" };
    const mapped = CODE_MAP[extractApiErrorCode(error.payload)];
    const message = extractApiErrorMessage(error.payload, error.message);
    if (mapped) return mapped === "failed" ? { kind: "failed", message } : ({ kind: mapped } as ImportProblem);
    return { kind: "failed", message };
  }
  if (error instanceof TypeError) return { kind: "network" };
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return { kind: "failed", message };
}

/** i18n key under add_account.credential.errors for a problem kind. */
export function importProblemCopyKey(problem: ImportProblem): string {
  return `add_account.credential.errors.${problem.kind}`;
}
