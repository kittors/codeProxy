/**
 * Builds a displayable upstream error payload for the error-detail modal.
 * Prefers stored output_content; when body storage was off (or older failed
 * logs never wrote output), reconstructs a compact summary from request details.
 *
 * The one-line summary comes from what the failure itself says: the error in a
 * JSON body, or the error event of a stream. A streamed reply is stored from its
 * start and cut at the stored-output cap, so its error event is often missing;
 * then the summary comes from the request details' diagnostic, which records the
 * error the relay saw. The head of a stream (`event: response.created …`) is
 * never a summary.
 */

export type ExtractedErrorPayload = {
  /** Raw text shown in the "full response" block. */
  content: string;
  /** Short human-readable summary; empty when nothing says what went wrong. */
  message: string;
  /** True when content was reconstructed from details, not a stored error body. */
  reconstructed: boolean;
};

/** Longest summary taken from text that is not a structured error. */
const MAX_SUMMARY_LENGTH = 200;

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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The message of an error object, in the shapes upstreams and the relay use:
 * `{"error":{"message"}}` (OpenAI, Anthropic, Gemini, the relay), a string
 * `error`, `{"type":"response.failed","response":{"error"}}` (Responses
 * streams) and a bare `{"message"}`.
 */
function errorMessageOf(value: unknown): string {
  // Gemini answers with an array holding one error object.
  const record = asRecord(Array.isArray(value) ? value[0] : value);
  if (!record) return "";
  const error = asRecord(record.error) ?? asRecord(asRecord(record.response)?.error);
  if (error) return pickString(error.message, error.type, error.code);
  return pickString(record.error, record.message);
}

function isEventStream(text: string): boolean {
  return /^(event|data|id|retry):/m.test(text.slice(0, 512)) && !text.startsWith("{") && !text.startsWith("[");
}

/** The message of the first error event in a server-sent event stream. */
function messageFromEventStream(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    const message = errorMessageOf(parseJson(payload));
    if (message) return message;
  }
  return "";
}

/** What a stored failure body says went wrong, or "" when it does not say. */
function messageFromOutput(output: string): string {
  if (isEventStream(output)) return messageFromEventStream(output);
  return errorMessageOf(parseJson(output));
}

/**
 * The summary of an error text recorded in the diagnostic: the message of the
 * JSON error it holds (whole, or after a prefix such as `status 429: `), or the
 * text itself.
 */
function messageFromErrorText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const brace = trimmed.indexOf("{");
  if (brace >= 0) {
    const message = errorMessageOf(parseJson(trimmed.slice(brace)));
    if (message) return message;
  }
  return trimmed.slice(0, MAX_SUMMARY_LENGTH);
}

type Diagnostic = {
  upstream: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  quota: Record<string, unknown> | null;
  loopGuard: Record<string, unknown> | null;
};

function parseDetails(detailsRaw: string): Record<string, unknown> | null {
  const trimmed = detailsRaw.trim();
  return trimmed ? asRecord(parseJson(trimmed)) : null;
}

function diagnosticOf(details: Record<string, unknown> | null): Diagnostic {
  const diagnostic = asRecord(details?.diagnostic);
  return {
    upstream: asRecord(diagnostic?.upstream),
    response: asRecord(diagnostic?.response),
    quota: asRecord(diagnostic?.quota),
    loopGuard: asRecord(diagnostic?.loop_guard),
  };
}

/**
 * What the diagnostic says went wrong: the error the client was answered with,
 * else the error the upstream call ended in, else the quota rejection, else what
 * loop protection told the client when it ended the request. A reply it cut has
 * no upstream error, and the error event it sent is often past the stored-output
 * cap; the diagnostic keeps that message whole.
 */
function messageFromDiagnostic(diagnostic: Diagnostic): string {
  return pickString(
    diagnostic.response?.error_message,
    messageFromErrorText(pickString(diagnostic.upstream?.error_message)),
    diagnostic.quota?.error_message,
    diagnostic.loopGuard?.message,
  );
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

function positiveStatus(value: unknown): number | null {
  const status = Number(value);
  return Number.isFinite(status) && status > 0 ? Math.round(status) : null;
}

function buildReconstructedError(details: Record<string, unknown>): ExtractedErrorPayload | null {
  const diagnostic = diagnosticOf(details);
  const diagnosticMessage = messageFromDiagnostic(diagnostic);
  const response = asRecord(details.response);
  const upstreamLog = typeof response?.upstream_log === "string" ? response.upstream_log : "";

  const bodyFromLog = extractLastApiResponseBody(upstreamLog);
  if (bodyFromLog) {
    const message =
      diagnosticMessage || messageFromOutput(bodyFromLog) || bodyFromLog.slice(0, MAX_SUMMARY_LENGTH);
    return { content: bodyFromLog, message, reconstructed: true };
  }

  // A rejection the relay made itself (a key's quota, say) has no upstream
  // status; the status it answered with stands in.
  const upstreamStatus = positiveStatus(diagnostic.upstream?.status) ?? extractLastApiResponseStatus(upstreamLog);
  const status = upstreamStatus ?? positiveStatus(diagnostic.response?.status);
  if (!status || status < 400) return null;

  const provider = pickString(diagnostic.upstream?.provider);
  const authLabel = pickString(diagnostic.upstream?.auth_label);
  const url = pickString(diagnostic.upstream?.url);
  const attempt = Number(diagnostic.upstream?.attempt);
  const code = pickString(diagnostic.response?.error_code, diagnostic.quota?.error_code);
  const type = pickString(diagnostic.response?.error_type, diagnostic.quota?.error_type);

  const messageParts = [upstreamStatus ? `Upstream returned HTTP ${status}` : `Relay answered HTTP ${status}`];
  if (provider) messageParts.push(`via ${provider}`);
  if (authLabel) messageParts.push(`(${authLabel})`);
  const summary = messageParts.join(" ");

  const payload: Record<string, unknown> = {
    error: {
      message: diagnosticMessage || summary,
      type: type || "upstream_error",
      http_status: status,
      ...(code ? { code } : {}),
      ...(provider ? { provider } : {}),
      ...(authLabel ? { auth_label: authLabel } : {}),
      ...(url ? { url } : {}),
      ...(Number.isFinite(attempt) && attempt > 0 ? { attempt: Math.round(attempt) } : {}),
      source: "reconstructed_from_request_details",
    },
  };

  return {
    content: JSON.stringify(payload, null, 2),
    message: diagnosticMessage || summary,
    reconstructed: true,
  };
}

/**
 * Resolve error modal content from stored output and optional request details.
 *
 * Called with the output alone (no details argument), the message is what the
 * output itself says, and empty when it does not say: then the request details
 * are worth fetching. Called with the details (an empty string when they could
 * not be read), the message falls back to the diagnostic, and last to the head
 * of a plain-text body.
 */
export function extractErrorFromLogContent(
  outputContent: string,
  detailsContent?: string,
): ExtractedErrorPayload | null {
  const output = (outputContent || "").trim();
  const details = parseDetails(detailsContent ?? "");
  if (output) {
    let message = messageFromOutput(output);
    if (!message && detailsContent !== undefined) {
      message =
        messageFromDiagnostic(diagnosticOf(details)) ||
        (isEventStream(output) ? "" : output.slice(0, MAX_SUMMARY_LENGTH));
    }
    return { content: output, message, reconstructed: false };
  }
  return details ? buildReconstructedError(details) : null;
}
