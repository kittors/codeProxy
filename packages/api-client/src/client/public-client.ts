import { MANAGEMENT_API_PREFIX, detectApiBaseFromLocation } from "./constants";
import { ApiClientError, extractApiErrorMessage } from "./errors";

interface PublicRequestOptions {
  base?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

const parseJsonOrText = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
};

const normalizePublicPath = (path: string): string => {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  if (/^(?:https?:)?\/\//i.test(trimmed)) {
    throw new ApiClientError({ message: "Public API paths must be relative." });
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export class PublicApiClient {
  private buildUrl(path: string, base = detectApiBaseFromLocation()): string {
    return `${base}${MANAGEMENT_API_PREFIX}/public${normalizePublicPath(path)}`;
  }

  async post<T>(path: string, body?: unknown, options?: PublicRequestOptions): Promise<T> {
    const url = this.buildUrl(path, options?.base);
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      method: "POST",
      signal: options?.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await parseJsonOrText(response);
    if (!response.ok) {
      throw new ApiClientError({
        message: extractApiErrorMessage(payload, `Request failed (${response.status})`),
        status: response.status,
        statusText: response.statusText,
        url,
        method: "POST",
        data: payload ?? null,
      });
    }
    return payload as T;
  }
}

export const publicApiClient = new PublicApiClient();
