import { REQUEST_TIMEOUT_MS, VERSION_HEADER_KEYS, BUILD_DATE_HEADER_KEYS } from "@/lib/constants";
import { computeManagementApiBase } from "@/lib/connection";

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
}

type ResponseType = "json" | "text" | "blob";

export class ApiClient {
  private apiBase = "";

  private managementKey = "";

  setConfig(config: ApiClientConfig): void {
    this.apiBase = computeManagementApiBase(config.apiBase);
    this.managementKey = config.managementKey.trim();
  }

  private buildUrl(path: string, params?: RequestOptions["params"]): string {
    const baseUrl = `${this.apiBase}${path}`;
    if (!params) return baseUrl;

    const pairs = Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    if (pairs.length === 0) return baseUrl;

    const url = new URL(baseUrl, window.location.origin);
    for (const [key, value] of pairs) {
      url.searchParams.set(key, String(value));
    }
    return url.toString().replace(window.location.origin, "");
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
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = this.buildUrl(path, options?.params);
      const headersFromOptions = new Headers(options?.headers);
      const headersFromInit = new Headers(init?.headers);
      const hasContentType =
        headersFromOptions.has("Content-Type") || headersFromInit.has("Content-Type");
      const headers = new Headers();

      if (typeof init?.body === "string" && !hasContentType) {
        headers.set("Content-Type", "application/json");
      }
      if (this.managementKey) {
        headers.set("Authorization", `Bearer ${this.managementKey}`);
      }

      headersFromOptions.forEach((value, key) => {
        headers.set(key, value);
      });
      headersFromInit.forEach((value, key) => {
        headers.set(key, value);
      });

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers,
      });

      if (response.status === 401) {
        window.dispatchEvent(new Event("unauthorized"));
      }

      const version = this.readHeader(response.headers, VERSION_HEADER_KEYS);
      const buildDate = this.readHeader(response.headers, BUILD_DATE_HEADER_KEYS);

      if (version || buildDate) {
        window.dispatchEvent(
          new CustomEvent("server-version-update", {
            detail: { version, buildDate },
          }),
        );
      }

      if (!response.ok) {
        let message = `请求失败（${response.status}）`;
        try {
          const text = await response.text();
          const trimmed = text.trim();

          if (trimmed) {
            try {
              const errorPayload = JSON.parse(trimmed) as Record<string, unknown>;
              const errorText =
                typeof errorPayload.error === "string"
                  ? errorPayload.error
                  : typeof errorPayload.message === "string"
                    ? errorPayload.message
                    : null;
              if (errorText) {
                message = errorText;
              } else {
                message = trimmed;
              }
            } catch {
              message = trimmed;
            }
          }
        } catch {
          // 忽略错误体解析失败
        }
        throw new Error(message);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      if (responseType === "blob") {
        return (await response.blob()) as T;
      }

      const text = await response.text();
      if (responseType === "text") {
        return text as T;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return undefined as T;
      }

      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return text as unknown as T;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { options });
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

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "PUT",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
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

  delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      init: {
        method: "DELETE",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      options,
    });
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
}

export const apiClient = new ApiClient();
