import { detectApiBaseFromLocation, publicApiClient } from "@code-proxy/api-client";
import type { ChartDataResponse, PublicLogsResponse } from "./types";

type LogContentBodyPart = "input" | "output";

type PublicLogContentResponse =
  | { id: number; model: string; part: LogContentBodyPart; content: string }
  | { input_content: string; output_content: string; model: string };

type V1ModelsResponse =
  | { data?: Array<{ id?: string }> }
  | { models?: Array<{ id?: string }> }
  | Array<{ id?: string }>
  | Record<string, unknown>;

const extractModelIds = (payload: V1ModelsResponse): string[] => {
  const data = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as Array<{ id?: string }>)
      : Array.isArray((payload as { models?: unknown }).models)
        ? ((payload as { models: unknown[] }).models as Array<{ id?: string }>)
        : [];
  return Array.from(
    new Set(
      data
        .map((item) =>
          item && typeof item === "object" ? String((item as { id?: unknown }).id) : "",
        )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
};

export async function fetchPublicLogs(params: {
  apiKey: string;
  page?: number;
  size?: number;
  days?: number;
  model?: string;
  status?: string;
  signal?: AbortSignal;
}): Promise<PublicLogsResponse> {
  return publicApiClient.post<PublicLogsResponse>(
    "/usage/logs",
    {
      api_key: params.apiKey,
      page: params.page,
      size: params.size,
      days: params.days,
      model: params.model,
      status: params.status,
    },
    { signal: params.signal },
  );
}

export async function fetchPublicChartData(params: {
  apiKey: string;
  days?: number;
}): Promise<ChartDataResponse> {
  return publicApiClient.post<ChartDataResponse>("/usage/chart-data", {
    api_key: params.apiKey,
    days: params.days,
  });
}

export async function fetchPublicLogContent(params: {
  id: number;
  apiKey: string;
  part: LogContentBodyPart;
  signal?: AbortSignal;
}): Promise<PublicLogContentResponse> {
  if (!Number.isInteger(params.id) || params.id <= 0) {
    throw new Error("Invalid log id");
  }

  return publicApiClient.post<PublicLogContentResponse>(
    `/usage/logs/${params.id}/content`,
    {
      api_key: params.apiKey,
      part: params.part,
      format: "json",
    },
    { signal: params.signal },
  );
}

export async function fetchAvailableModels(apiKey: string): Promise<string[]> {
  const base = detectApiBaseFromLocation();
  const resp = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed (${resp.status})`);
  }
  const payload = (await resp.json()) as V1ModelsResponse;
  return extractModelIds(payload);
}
