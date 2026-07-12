/**
 * Builds a displayable upstream error payload for the error-detail modal.
 * Prefers stored output_content; when body storage was off (or older failed
 * logs never wrote output), reconstructs a compact summary from request details.
 */

export type ExtractedErrorPayload = {
  /** Raw text shown in the "full response" block. */
  content: string;
  /** Short human-readable summary. */
  message: string;
  /** True when content was reconstructed from details, not a stored error body. */
  reconstructed: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function extractMessageFromJsonText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const record = asRecord(parsed);
    if (!record) return trimmed.slice(0, 200);
    const error = asRecord(record.error);
    if (error) {
      const message = pickString(error.message, error.type, error.code);
      if (message) return message;
    }
    const message = pickString(record.message, record.error);
    if (message) return message;
  } catch {
    return trimmed.slice(0, 200);
  }
  return trimmed.slice(0, 200);
}

function extractLastApiResponseStatus(upstreamLog: string): number | null {
  if (!upstreamLog) return null;
  const matches = [...upstreamLog.matchAll(/Status:\s*(\d{3})\b/g)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  const status = Number(last);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function extractLastApiResponseBody(upstreamLog: string): string {
  if (!upstreamLog) return "";
  const parts = upstreamLog.split(/===\s*API RESPONSE\b/i);
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    const block = parts[i] ?? "";
    const bodyIdx = block.search(/\nBody:\n/i);
    if (bodyIdx < 0) continue;
    const body = block.slice(bodyIdx + "\nBody:\n".length).trim();
    if (!body || body === "<not stored>") continue;
    return body;
  }
  return "";
}

function buildReconstructedError(detailsRaw: string): ExtractedErrorPayload | null {
  const trimmed = detailsRaw.trim();
  if (!trimmed) return null;

  let details: Record<string, unknown> | null = null;
  try {
    details = asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
  if (!details) return null;

  const diagnostic = asRecord(details.diagnostic);
  const diagnosticUpstream = asRecord(diagnostic?.upstream);
  const response = asRecord(details.response);
  const upstreamLog =
    typeof response?.upstream_log === "string" ? response.upstream_log : "";

  const bodyFromLog = extractLastApiResponseBody(upstreamLog);
  if (bodyFromLog) {
    const message = extractMessageFromJsonText(bodyFromLog) || bodyFromLog.slice(0, 200);
    return { content: bodyFromLog, message, reconstructed: true };
  }

  const statusFromDiagnostic = Number(diagnosticUpstream?.status);
  const statusFromLog = extractLastApiResponseStatus(upstreamLog);
  const status =
    Number.isFinite(statusFromDiagnostic) && statusFromDiagnostic > 0
      ? Math.round(statusFromDiagnostic)
      : statusFromLog;

  if (!status || status < 400) return null;

  const provider = pickString(diagnosticUpstream?.provider);
  const authLabel = pickString(diagnosticUpstream?.auth_label);
  const url = pickString(diagnosticUpstream?.url);
  const attempt = Number(diagnosticUpstream?.attempt);

  const messageParts = [`Upstream returned HTTP ${status}`];
  if (provider) messageParts.push(`via ${provider}`);
  if (authLabel) messageParts.push(`(${authLabel})`);

  const payload: Record<string, unknown> = {
    error: {
      message: messageParts.join(" "),
      type: "upstream_error",
      http_status: status,
      ...(provider ? { provider } : {}),
      ...(authLabel ? { auth_label: authLabel } : {}),
      ...(url ? { url } : {}),
      ...(Number.isFinite(attempt) && attempt > 0 ? { attempt: Math.round(attempt) } : {}),
      source: "reconstructed_from_request_details",
    },
  };

  const content = JSON.stringify(payload, null, 2);
  return {
    content,
    message: String((payload.error as Record<string, unknown>).message),
    reconstructed: true,
  };
}

/**
 * Resolve error modal content from stored output and optional request details.
 */
export function extractErrorFromLogContent(
  outputContent: string,
  detailsContent = "",
): ExtractedErrorPayload | null {
  const output = (outputContent || "").trim();
  if (output) {
    return {
      content: output,
      message: extractMessageFromJsonText(output),
      reconstructed: false,
    };
  }
  return buildReconstructedError(detailsContent);
}
