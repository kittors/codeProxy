import {
  REQUEST_TIMEOUT_MS,
  VERSION_HEADER_KEYS,
  BUILD_DATE_HEADER_KEYS,
  computeManagementApiBase,
} from "./constants";
import { extractDownloadFilename, type BrowserFilePickerWindow } from "./download";
import { ApiError, extractApiErrorMessage, isAbortError, truncateErrorText } from "./errors";
import { unwrapApiEnvelope, type ApiSuccessEnvelope } from "./response";

interface ApiClientConfig {
  apiBase: string;
  managementKey: string;
}

type Primitive = string | number | boolean;

export interface RequestOptions {
  params?: Record<string, Primitive | null | undefined>;
  headers?: HeadersInit;
  timeoutMs?: number;
  signal?: AbortSignal;
  unwrapEnvelope?: boolean;
}

type ResponseType = "json" | "text" | "blob";

const RESERVED_MANAGEMENT_HEADERS = new Set(["authorization"]);

const getWindowOrigin = () => {
  try {
    return window.location.origin;
  } catch {
    return "http://localhost";
  }
};

const dispatchWindowEvent = (event: Event): void => {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(event);
  }
};

const isHtmlDocument = (contentType: string, text: string) =>
  contentType.toLowerCase().includes("text/html") &&
  /^<!doctype html|^<html[\s>]/i.test(text.trim());

const buildHtmlErrorMessage = (response: Response) => {
  const status = response.status || 0;
  const suffix = response.statusText?.trim()
    ? `${status} ${response.statusText.trim()}`
    : String(status);
  return `Management API temporarily returned an HTML error page (${suffix}).`;
};

const normalizeRequestPath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    throw new ApiError({ message: "Management API paths must be relative." });
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export class ApiClient {
  private apiBase = "";

  private managementKey = "";

  private authSuspended = false;

  setConfig(config: ApiClientConfig): void {
    this.apiBase = computeManagementApiBase(config.apiBase);
    this.managementKey = config.managementKey.trim();
    this.authSuspended = false;
  }

  private buildUrl(path: string, params?: RequestOptions["params"]): string {
    const requestPath = normalizeRequestPath(path);
    const baseUrl = `${this.apiBase}${requestPath}`;
    if (!params) return baseUrl;

    const pairs = Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    if (pairs.length === 0) return baseUrl;

    const origin = getWindowOrigin();
    const url = new URL(baseUrl, origin);
    for (const [key, value] of pairs) {
      url.searchParams.set(key, String(value));
    }
    return url.toString().replace(origin, "");
  }

  private readHeader(headers: Headers, keys: string[]): string | null {
    for (const key of keys) {
      const value = headers.get(key);
      if (value?.trim()) {
        return value;
      }
    }
    return null;
  }

  private mergeAllowedHeaders(target: Headers, source: Headers): void {
    source.forEach((value, key) => {
      if (RESERVED_MANAGEMENT_HEADERS.has(key.toLowerCase())) return;
      target.set(key, value);
    });
  }

  private buildHeaders(init?: RequestInit, options?: RequestOptions): Headers {
    const headersFromOptions = new Headers(options?.headers);
    const headersFromInit = new Headers(init?.headers);
    const hasContentType =
      headersFromOptions.has("Content-Type") || headersFromInit.has("Content-Type");
    const headers = new Headers();

    if (typeof init?.body === "string" && !hasContentType) {
      headers.set("Content-Type", "application/json");
    }

    this.mergeAllowedHeaders(headers, headersFromOptions);
    this.mergeAllowedHeaders(headers, headersFromInit);

    if (this.managementKey) {
      headers.set("Authorization", `Bearer ${this.managementKey}`);
    }

    return headers;
  }

  private createAbortController(options?: RequestOptions) {
    const controller = new AbortController();
    const timeoutMs = Math.max(1, options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
    let timedOut = false;
    const timer = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const externalSignal = options?.signal;
    const onExternalAbort = () => controller.abort();

    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      }
    }

    return {
      controller,
      didTimeout: () => timedOut,
      cleanup: () => {
        globalThis.clearTimeout(timer);
        if (externalSignal) {
          externalSignal.removeEventListener("abort", onExternalAbort);
        }
      },
    };
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    const trimmed = text.trim();
    if (!trimmed) return undefined;

    const contentType = response.headers.get("Content-Type") ?? "";
    if (isHtmlDocument(contentType, trimmed)) {
      throw new ApiError({
        message:
          "Management API returned the web panel HTML instead of JSON. Check the API base URL.",
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        payload: truncateErrorText(trimmed),
      });
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return text;
    }
  }

  private async buildApiError(response: Response): Promise<ApiError> {
    let payload: unknown = null;
    let message = `Request failed (${response.status})`;

    try {
      const text = await response.text();
      const trimmed = text.trim();
      if (trimmed) {
        if (isHtmlDocument(response.headers.get("Content-Type") ?? "", trimmed)) {
          payload = truncateErrorText(trimmed);
          message = buildHtmlErrorMessage(response);
        } else {
          try {
            payload = JSON.parse(trimmed) as unknown;
            message = extractApiErrorMessage(payload, truncateErrorText(trimmed));
          } catch {
            payload = truncateErrorText(trimmed);
            message = truncateErrorText(trimmed);
          }
        }
      }
    } catch {
      // Keep the status-based fallback when error body cannot be read.
    }

    return new ApiError({
      message,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      payload,
      isAuthError: this.shouldSuspendAuth(response.status, message),
    });
  }

  private shouldSuspendAuth(status: number, message: string): boolean {
    if (status === 401) return true;
    return status === 403 && /IP banned due to too many failed attempts/i.test(message);
  }

  private suspendAuth(): void {
    if (this.authSuspended) return;
    this.authSuspended = true;
    dispatchWindowEvent(new Event("unauthorized"));
  }

  private assertAuthActive(): void {
    if (this.authSuspended) {
      throw new ApiError({
        message: "Management session is no longer valid. Please sign in again.",
        status: 401,
        isAuthError: true,
      });
    }
  }

  private applyVersionHeaders(response: Response): void {
    const version = this.readHeader(response.headers, VERSION_HEADER_KEYS);
    const buildDate = this.readHeader(response.headers, BUILD_DATE_HEADER_KEYS);

    if (version || buildDate) {
      dispatchWindowEvent(
        new CustomEvent("server-version-update", {
          detail: { version, buildDate },
        }),
      );
    }
  }

  private async request<T>(
    path: string,
    {
      init,
      options,
      responseType = "json",
    }: {
      init?: RequestInit;
      options?: RequestOptions;
      responseType?: ResponseType;
    } = {},
  ): Promise<T> {
    this.assertAuthActive();
    const { controller, cleanup, didTimeout } = this.createAbortController(options);

    try {
      const url = this.buildUrl(path, options?.params);
      const headers = this.buildHeaders(init, options);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });

      this.applyVersionHeaders(response);

      if (!response.ok) {
        const error = await this.buildApiError(response);
        if (error.isAuthError) {
          this.suspendAuth();
        }
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      if (responseType === "blob") {
        return (await response.blob()) as T;
      }

      if (responseType === "text") {
        return (await response.text()) as T;
      }

      const payload = await this.parseResponseBody(response);
      return (options?.unwrapEnvelope ? unwrapApiEnvelope<T>(payload) : payload) as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new ApiError({
          message: didTimeout()
            ? `Request timed out after ${options?.timeoutMs ?? REQUEST_TIMEOUT_MS}ms`
            : "Request was cancelled",
          isTimeout: didTimeout(),
          url: path,
        });
      }
      throw error;
    } finally {
      cleanup();
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { options });
  }

  getData<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.get<T>(path, { ...options, unwrapEnvelope: true });
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
  }

  postData<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.post<T>(path, body, { ...options, unwrapEnvelope: true });
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "PUT",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
  }

  putData<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.put<T>(path, body, { ...options, unwrapEnvelope: true });
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "PATCH",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
  }

  patchData<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.patch<T>(path, body, { ...options, unwrapEnvelope: true });
  }

  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "DELETE",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
  }

  deleteData<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.delete<T>(path, body, { ...options, unwrapEnvelope: true });
  }

  postForm<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "POST",
        body: formData,
      },
      options,
    });
  }

  putRawText(path: string, bodyText: string, options?: RequestOptions): Promise<void> {
    return this.request<void>(path, {
      init: {
        method: "PUT",
        body: bodyText,
        headers: options?.headers,
      },
      options: { ...options, headers: undefined },
    });
  }

  getText(path: string, options?: RequestOptions): Promise<string> {
    return this.request<string>(path, { options, responseType: "text" });
  }

  getBlob(path: string, options?: RequestOptions): Promise<Blob> {
    return this.request<Blob>(path, { options, responseType: "blob" });
  }

  async downloadToFile(
    path: string,
    preferredFilename: string,
    options?: RequestOptions,
  ): Promise<void> {
    this.assertAuthActive();
    const { controller, cleanup, didTimeout } = this.createAbortController(options);

    try {
      const url = this.buildUrl(path, options?.params);
      const headers = this.buildHeaders(undefined, options);
      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      this.applyVersionHeaders(response);

      if (!response.ok) {
        const error = await this.buildApiError(response);
        if (error.isAuthError) {
          this.suspendAuth();
        }
        throw error;
      }

      const filename = extractDownloadFilename(response.headers, preferredFilename);
      const pickerWindow = window as BrowserFilePickerWindow;

      if (pickerWindow.showSaveFilePicker && response.body) {
        try {
          const handle = await pickerWindow.showSaveFilePicker({ suggestedName: filename });
          const writable = await handle.createWritable();
          const reader = response.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              await writable.write(value);
            }
          }
          await writable.close();
          return;
        } catch (error) {
          if (
            error instanceof DOMException &&
            (error.name === "AbortError" || error.name === "SecurityError")
          ) {
            return;
          }
        }
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new ApiError({
          message: didTimeout()
            ? `Request timed out after ${options?.timeoutMs ?? REQUEST_TIMEOUT_MS}ms`
            : "Request was cancelled",
          isTimeout: didTimeout(),
          url: path,
        });
      }
      throw error;
    } finally {
      cleanup();
    }
  }
}

export const apiClient = new ApiClient();
export type { ApiSuccessEnvelope };
export { ApiError, unwrapApiEnvelope };
