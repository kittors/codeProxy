import {
  detectApiBaseFromLocation,
  publicApiClient,
} from "@code-proxy/api-client";
import {
  emptyModelPricing,
  normalizeModelModalities,
  normalizeModelPricing,
  type ModelPricing,
} from "@features/model-availability";
import type {
  ChartDataResponse,
  PublicLogsResponse,
  PublicUsageSummaryResponse,
} from "./types";

type LogContentBodyPart = "input" | "output";

type PublicLogContentResponse =
  | { id: number; model: string; part: LogContentBodyPart; content: string }
  | { input_content: string; output_content: string; model: string };

export type PublicModelItem = {
  id: string;
  description: string;
  ownedBy: string;
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportsVision: boolean;
};

type V1ModelsResponse =
  | { data?: unknown[] }
  | { models?: unknown[] }
  | unknown[]
  | Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractModelItems = (payload: V1ModelsResponse): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];
  if (Array.isArray(payload.data)) return payload.data as unknown[];
  if (Array.isArray(payload.models)) return payload.models as unknown[];
  return [];
};

export const normalizePublicModelItem = (item: unknown): PublicModelItem | null => {
  if (!isRecord(item)) return null;
  const id = String(item.id ?? item.model_id ?? item.name ?? "").trim();
  if (!id) return null;
  const inputModalities = normalizeModelModalities(
    item.input_modalities ?? item.inputModalities,
  );
  const outputModalities = normalizeModelModalities(
    item.output_modalities ?? item.outputModalities,
  );
  const explicitVision = item.supports_vision ?? item.supportsVision;
  const supportsVision =
    typeof explicitVision === "boolean"
      ? explicitVision
      : inputModalities.some((m) => m.toLowerCase() === "image");

  return {
    id,
    description: String(item.description ?? "").trim(),
    ownedBy: String(item.owned_by ?? item.ownedBy ?? "").trim(),
    pricing: isRecord(item.pricing)
      ? normalizeModelPricing(item)
      : emptyModelPricing(),
    inputModalities,
    outputModalities,
    supportsVision,
  };
};

const extractModels = (payload: V1ModelsResponse): PublicModelItem[] => {
  const byId = new Map<string, PublicModelItem>();
  for (const item of extractModelItems(payload)) {
    const model = normalizePublicModelItem(item);
    if (!model) continue;
    byId.set(model.id.toLowerCase(), model);
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
};

export async function fetchPublicLogs(params: {
  apiKey: string;
  page?: number;
  size?: number;
  days?: number;
  models?: string[];
  channels?: string[];
  statuses?: string[];
  modelsEmpty?: boolean;
  channelsEmpty?: boolean;
  statusesEmpty?: boolean;
  signal?: AbortSignal;
}): Promise<PublicLogsResponse> {
  return publicApiClient.post<PublicLogsResponse>(
    "/usage/logs",
    {
      api_key: params.apiKey,
      page: params.page,
      size: params.size,
      days: params.days,
      models: params.models,
      channels: params.channels,
      statuses: params.statuses,
      models_empty: params.modelsEmpty,
      channels_empty: params.channelsEmpty,
      statuses_empty: params.statusesEmpty,
    },
    { signal: params.signal },
  );
}

export async function fetchPublicChartData(params: {
  apiKey: string;
  days?: number;
  signal?: AbortSignal;
}): Promise<ChartDataResponse> {
  return publicApiClient.post<ChartDataResponse>(
    "/usage/chart-data",
    {
      api_key: params.apiKey,
      days: params.days,
    },
    { signal: params.signal },
  );
}

export async function fetchPublicUsageSummary(params: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<PublicUsageSummaryResponse> {
  return publicApiClient.post<PublicUsageSummaryResponse>(
    "/usage/summary",
    { api_key: params.apiKey },
    { signal: params.signal },
  );
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

export async function fetchAvailableModels(apiKey: string): Promise<PublicModelItem[]> {
  const base = detectApiBaseFromLocation();
  const resp = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Request failed (${resp.status})`);
  }
  const payload = (await resp.json()) as V1ModelsResponse;
  return extractModels(payload);
}
