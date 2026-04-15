import { MANAGEMENT_API_PREFIX } from "@/lib/constants";
import { detectApiBaseFromLocation } from "@/lib/connection";
import type { ChartDataResponse, PublicLogsResponse } from "@/modules/apikey-lookup/types";

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
        .map((item) => (item && typeof item === "object" ? String((item as { id?: unknown }).id) : ""))
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
  const base = detectApiBaseFromLocation();
  const resp = await fetch(`${base}${MANAGEMENT_API_PREFIX}/public/usage/logs`, {
    method: "POST",
    signal: params.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: params.apiKey,
      page: params.page,
      size: params.size,
      days: params.days,
      model: params.model,
      status: params.status,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<PublicLogsResponse>;
}

export async function fetchPublicChartData(params: {
  apiKey: string;
  days?: number;
}): Promise<ChartDataResponse> {
  const base = detectApiBaseFromLocation();
  const resp = await fetch(`${base}${MANAGEMENT_API_PREFIX}/public/usage/chart-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: params.apiKey,
      days: params.days,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed (${resp.status})`);
  }
  return resp.json() as Promise<ChartDataResponse>;
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
