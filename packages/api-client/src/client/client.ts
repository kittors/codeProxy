import { getAuthBroadcast } from "./auth-broadcast";
import { isSessionEndingFailure, sendWithAuth } from "./auth-fetch";
import { AuthGate, type AuthRequirement, type AuthState } from "./auth-state";
import {
  REQUEST_TIMEOUT_MS,
  VERSION_HEADER_KEYS,
  BUILD_DATE_HEADER_KEYS,
  computeManagementApiBase,
} from "./constants";
import { extractDownloadFilename, type BrowserFilePickerWindow } from "./download";
import {
  ApiError,
  extractApiErrorCode,
  extractApiErrorMessage,
  isAbortError,
  truncateErrorText,
} from "./errors";
import { unwrapApiEnvelope, type ApiSuccessEnvelope } from "./response";
import { TokenRefresher } from "./token-refresher";

interface ApiClientConfig {
  apiBase: string;
  /** undefined keeps the current key; "" clears it and shuts the gate. */
  managementKey?: string;
}

type Primitive = string | number | boolean;

export interface RequestOptions {
  params?: Record<string, Primitive | null | undefined>;
  headers?: HeadersInit;
  timeoutMs?: number;
  signal?: AbortSignal;
  unwrapEnvelope?: boolean;
  /** "anonymous" is reserved for the login call; see AuthRequirement. */
  auth?: AuthRequirement;
}

export interface ServerSentEvent<T> {
  id?: string;
  event?: string;
  data: T;
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

  private readonly gate = new AuthGate();

  private readonly broadcast = getAuthBroadcast();

  private readonly refresher = new TokenRefresher({
    gate: this.gate,
    broadcast: this.broadcast,
    apiBase: () => this.apiBase,
  });

  private defaultHeaders = new Headers();

  constructor() {
    this.broadcast.subscribe((message) => {
      if (message.type === "signed-out") {
        this.suspend(message.code);
        return;
      }
      // Signals carry no token by design; the payload is only a hint that our
      // own snapshot is worth re-reading.
      this.refresher.adoptPersistedRotation(message.rotationSeq, message.accountId);
    });
  }

  getAuthGeneration(): number {
    return this.gate.getGeneration();
  }

  getAuthState(): AuthState {
    return this.gate.getState();
  }

  isAuthUsable(): boolean {
    return this.gate.isUsable();
  }

  setConfig(config: ApiClientConfig & { refreshToken?: string | null }): void {
    this.apiBase = computeManagementApiBase(config.apiBase);
    // undefined = keep the current value; string/null = replace. The gate derives
    // its own open/shut state from the result, so clearing the key here is what
    // actually stops credential-less egress after logout.
    this.gate.configure({
      ...(config.managementKey !== undefined ? { managementKey: config.managementKey } : {}),
      ...(config.refreshToken !== undefined ? { refreshToken: config.refreshToken } : {}),
    });
    this.refresher.reset();
  }

  /**
   * Swap the platform-admin tenant header without touching credentials.
   *
   * Deliberately does not bump the auth generation: a tenant switch continues
   * the same session, and cancelling an in-flight refresh here would drop the
   * rotated token on the floor.
   */
  setTenantOverride(tenantId: string): void {
    const normalized = tenantId.trim();
    this.setDefaultHeaders(normalized ? { "X-Effective-Tenant-ID": normalized } : {});
  }

  /**
   * Take on tokens another tab rotated into shared storage.
   *
   * Distinct from setConfig: it must not bump the auth generation. A generation
   * bump means "different account", which cancels in-flight requests and any
   * running refresh — the wrong reaction to a sibling tab renewing the session
   * this client is already using.
   */
  adoptRotatedTokens(accessToken: string, refreshToken: string): void {
    this.gate.adoptRotated(accessToken, refreshToken);
  }

  setDefaultHeaders(headers: HeadersInit): void {
    this.defaultHeaders = new Headers(headers);
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
    const headers = new Headers(this.defaultHeaders);

    if (typeof init?.body === "string" && !hasContentType) {
      headers.set("Content-Type", "application/json");
    }

    this.mergeAllowedHeaders(headers, headersFromOptions);
    this.mergeAllowedHeaders(headers, headersFromInit);

    const managementKey = this.gate.getManagementKey();
    if (managementKey) {
      headers.set("Authorization", `Bearer ${managementKey}`);
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
      isAuthError: isSessionEndingFailure(response.status, message, payload),
    });
  }

  private suspend(code = ""): void {
    if (!this.gate.suspend()) return;
    dispatchWindowEvent(
      new CustomEvent("unauthorized", {
        detail: { code, authGeneration: this.gate.getGeneration() },
      }),
    );
  }

  /** Shut the session down for a response that arrived on the current generation. */
  private suspendIfFatal(error: ApiError, generation: number): void {
    if (!error.isAuthError || this.gate.getGeneration() !== generation) return;
    this.suspend(extractApiErrorCode(error.payload));
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
    const { controller, cleanup, didTimeout } = this.createAbortController(options);

    try {
      const url = this.buildUrl(path, options?.params);
      const { response, generation } = await sendWithAuth({
        gate: this.gate,
        refresher: this.refresher,
        url,
        init: init ?? {},
        buildHeaders: () => this.buildHeaders(init, options),
        auth: options?.auth ?? "required",
        signal: controller.signal,
      });

      this.applyVersionHeaders(response);

      if (!response.ok) {
        const error = await this.buildApiError(response);
        this.suspendIfFatal(error, generation);
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

  async streamSSE<T>(
    path: string,
    onEvent: (event: ServerSentEvent<T>) => void,
    options?: Omit<RequestOptions, "timeoutMs" | "unwrapEnvelope">,
  ): Promise<void> {
    const controller = new AbortController();
    const externalSignal = options?.signal;
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const url = this.buildUrl(path, options?.params);
      const { response, generation } = await sendWithAuth({
        gate: this.gate,
        refresher: this.refresher,
        url,
        init: { method: "GET" },
        buildHeaders: () => {
          const headers = this.buildHeaders(undefined, options);
          headers.set("Accept", "text/event-stream");
          return headers;
        },
        auth: "required",
        signal: controller.signal,
      });
      this.applyVersionHeaders(response);
      if (!response.ok) {
        const error = await this.buildApiError(response);
        this.suspendIfFatal(error, generation);
        throw error;
      }
      if (!response.body) {
        throw new ApiError({
          message: "Management API returned an empty event stream.",
          status: response.status,
          statusText: response.statusText,
          url: response.url,
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const dispatchBlock = (block: string) => {
        let id: string | undefined;
        let event: string | undefined;
        const data: string[] = [];
        block.split(/\r?\n/).forEach((line) => {
          if (!line || line.startsWith(":")) return;
          const separator = line.indexOf(":");
          const field = separator >= 0 ? line.slice(0, separator) : line;
          let value = separator >= 0 ? line.slice(separator + 1) : "";
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "id") id = value;
          else if (field === "event") event = value;
          else if (field === "data") data.push(value);
        });
        if (data.length === 0) return;
        const text = data.join("\n");
        onEvent({ id, event, data: JSON.parse(text) as T });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        blocks.forEach(dispatchBlock);
      }
      buffer += decoder.decode();
      if (buffer.trim()) dispatchBlock(buffer);
    } catch (error) {
      if (isAbortError(error) && externalSignal?.aborted) return;
      throw error;
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
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
    const { controller, cleanup, didTimeout } = this.createAbortController(options);

    try {
      const url = this.buildUrl(path, options?.params);
      const { response, generation } = await sendWithAuth({
        gate: this.gate,
        refresher: this.refresher,
        url,
        init: { method: "GET" },
        buildHeaders: () => this.buildHeaders(undefined, options),
        auth: "required",
        signal: controller.signal,
      });

      this.applyVersionHeaders(response);

      if (!response.ok) {
        const error = await this.buildApiError(response);
        this.suspendIfFatal(error, generation);
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
