import { isRecord } from "./response";

const MAX_ERROR_TEXT_LENGTH = 2000;

export interface ApiErrorOptions {
  message: string;
  status?: number;
  statusText?: string;
  url?: string;
  method?: string;
  payload?: unknown;
  data?: unknown;
  isTimeout?: boolean;
  isAuthError?: boolean;
  cause?: unknown;
}

export type ApiClientErrorOptions = ApiErrorOptions;
export type ApiErrorBody = Record<string, unknown> | string | null;

export const isAbortError = (error: unknown): error is DOMException =>
  typeof DOMException !== "undefined" &&
  error instanceof DOMException &&
  error.name === "AbortError";

export const truncateErrorText = (text: string): string => {
  if (text.length <= MAX_ERROR_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_ERROR_TEXT_LENGTH)}...`;
};

/**
 * Reads the flat `{"error": "<code>", "message": "<reason>"}` body several CliRelay
 * management handlers answer with (PUT /config.yaml's invalid_yaml / invalid_config,
 * the update and Vertex import handlers) as "code: reason". The string `error` alone
 * gave operators the bare code and hid the reason they act on, such as which YAML
 * line or channel group failed; the code stays in front so a message can still be
 * matched against server logs. Handled here rather than reshaped on the server: the
 * panel auto-updates onto older backends that keep answering this way.
 */
const joinErrorCodeAndReason = (error: unknown, message: unknown): string => {
  if (typeof error !== "string" || typeof message !== "string") return "";
  const code = error.trim();
  const reason = message.trim();
  if (!code || !reason) return "";
  const lowerCode = code.toLowerCase();
  const lowerReason = reason.toLowerCase();
  // A reason that already is, or leads with, its code is not prefixed twice.
  if (lowerReason === lowerCode || lowerReason.startsWith(`${lowerCode}:`)) return reason;
  return `${code}: ${reason}`;
};

export const extractApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload === "string" && payload.trim()) {
    return truncateErrorText(payload.trim());
  }
  if (!isRecord(payload)) return fallback;

  const codeWithReason = joinErrorCodeAndReason(payload.error, payload.message);
  if (codeWithReason) return truncateErrorText(codeWithReason);

  const nestedError = isRecord(payload.error) ? payload.error : null;
  const candidates = [payload.error, nestedError?.message, payload.message, payload.detail];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return truncateErrorText(candidate.trim());
    }
  }
  return fallback;
};

export const extractApiErrorCode = (payload: unknown): string => {
  if (!isRecord(payload)) return "";
  if (typeof payload.code === "string") return payload.code.trim();
  if (!isRecord(payload.error) || typeof payload.error.code !== "string") return "";
  return payload.error.code.trim();
};

/**
 * The structured `details` an error carries alongside its code — for example a
 * cooldown's `retry_after_seconds`, which is the difference between telling a
 * locked-out user "try again later" and telling them how much later.
 */
export const extractApiErrorDetails = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) return {};
  if (isRecord(payload.details)) return payload.details;
  if (isRecord(payload.error) && isRecord(payload.error.details)) return payload.error.details;
  return {};
};

export class ApiError extends Error {
  readonly name: string = "ApiError";

  readonly status: number;

  readonly statusText: string;

  readonly url: string;

  readonly method: string;

  readonly payload: unknown;

  readonly data: unknown;

  readonly isTimeout: boolean;

  readonly isAuthError: boolean;

  constructor({
    message,
    status = 0,
    statusText = "",
    url = "",
    method = "",
    payload = null,
    data,
    isTimeout = false,
    isAuthError = false,
    cause,
  }: ApiErrorOptions) {
    super(message);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.method = method;
    this.payload = data ?? payload;
    this.data = this.payload;
    this.isTimeout = isTimeout;
    this.isAuthError = isAuthError;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export class ApiClientError extends ApiError {
  readonly name = "ApiClientError";
}

export const isApiClientError = (error: unknown): error is ApiError => error instanceof ApiError;
