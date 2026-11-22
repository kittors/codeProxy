import { MANAGEMENT_API_PREFIX, detectApiBaseFromLocation } from "./constants";
import {
  ApiClientError,
  buildHtmlErrorMessage,
  extractApiErrorMessage,
  isHtmlDocument,
  truncateErrorText,
} from "./errors";

interface PublicRequestOptions {
  base?: string;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

const parsePublicResponse = async (
  response: Response,
  url: string,
  method: "GET" | "POST",
): Promise<unknown> => {
  const text = await response.text();
  const trimmed = text.trim();
  const contentType = response.headers.get("Content-Type") ?? "";
  const isHtml = isHtmlDocument(contentType, trimmed);

  if (!response.ok) {
    if (isHtml) {
      throw new ApiClientError({
        message: buildHtmlErrorMessage(response),
        status: response.status,
        statusText: response.statusText,
        url,
        method,
        data: truncateErrorText(trimmed),
      });
    }
    let payload: unknown = undefined;
    if (trimmed) {
      try {
        payload = JSON.parse(trimmed) as unknown;
      } catch {
        payload = trimmed;
      }
    }
    throw new ApiClientError({
      message: extractApiErrorMessage(payload, `Request failed (${response.status})`),
      status: response.status,
      statusText: response.statusText,
      url,
      method,
      data: payload ?? null,
    });
  }

  if (!trimmed) return undefined;
  if (isHtml) {
    throw new ApiClientError({
      message: "Service returned an HTML page instead of JSON.",
      status: response.status,
      statusText: response.statusText,
      url,
      method,
      data: truncateErrorText(trimmed),
    });
  }
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

  async get<T>(path: string, options?: PublicRequestOptions): Promise<T> {
    const url = this.buildUrl(path, options?.base);
    const headers = new Headers(options?.headers);
    const response = await fetch(url, {
      method: "GET",
      signal: options?.signal,
      headers,
    });
    return (await parsePublicResponse(response, url, "GET")) as T;
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

    return (await parsePublicResponse(response, url, "POST")) as T;
  }
}

export const publicApiClient = new PublicApiClient();
