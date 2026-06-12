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

export const extractApiErrorMessage = (payload: unknown, fallback: string): string => {
  if (typeof payload === "string" && payload.trim()) {
    return truncateErrorText(payload.trim());
  }
  if (!isRecord(payload)) return fallback;

  const nestedError = isRecord(payload.error) ? payload.error : null;
  const candidates = [payload.error, nestedError?.message, payload.message, payload.detail];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return truncateErrorText(candidate.trim());
    }
  }
  return fallback;
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
