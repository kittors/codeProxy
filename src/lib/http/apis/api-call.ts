import { apiClient } from "@/lib/http/client";
import type { ApiCallRequest, ApiCallResult } from "@/lib/http/types";
import { isRecord } from "@/lib/http/apis/helpers";

const normalizeApiCallBody = (input: unknown): { bodyText: string; body: unknown | null } => {
  if (input === undefined || input === null) return { bodyText: "", body: null };

  if (typeof input === "string") {
    const text = input;
    const trimmed = text.trim();
    if (!trimmed) return { bodyText: text, body: null };
    try {
      return { bodyText: text, body: JSON.parse(trimmed) };
    } catch {
      return { bodyText: text, body: text };
    }
  }

  try {
    return { bodyText: JSON.stringify(input), body: input };
  } catch {
    return { bodyText: String(input), body: input };
  }
};

export const getApiCallErrorMessage = (result: ApiCallResult): string => {
  const status = result.statusCode;
  const body = result.body;
  const bodyText = result.bodyText;
  let message = "";

  if (isRecord(body)) {
    const errorValue = body.error;
    if (isRecord(errorValue) && typeof errorValue.message === "string") {
      message = errorValue.message;
    } else if (typeof errorValue === "string") {
      message = errorValue;
    }
    if (!message && typeof body.message === "string") {
      message = body.message;
    }
  } else if (typeof body === "string") {
    message = body;
  }

  if (!message && bodyText) {
    message = bodyText;
  }

  if (status && message) return `${status} ${message}`.trim();
  if (status) return `HTTP ${status}`;
  return message || "Request failed";
};

export const apiCallApi = {
  request: async (payload: ApiCallRequest): Promise<ApiCallResult> => {
    const response = await apiClient.post<Record<string, unknown>>("/api-call", payload, {
      timeoutMs: 60000,
    });
    const statusCode = Number(response?.status_code ?? response?.statusCode ?? 0);
    const header = (response?.header ?? response?.headers ?? {}) as Record<string, string[]>;
    const { bodyText, body } = normalizeApiCallBody(response?.body);

    return {
      statusCode,
      header,
      bodyText,
      body: body as ApiCallResult["body"],
    };
  },
};
