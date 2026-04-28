import { apiClient } from "@/lib/http/client";

export interface ProxyPoolEntry {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
  maskedUrl?: string;
}

export interface ProxyCheckRequest {
  id?: string;
  url?: string;
  testUrl?: string;
}

export interface ProxyCheckResult {
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  message?: string;
}

type RawProxyPoolEntry = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  enabled?: unknown;
  description?: unknown;
  masked_url?: unknown;
  maskedUrl?: unknown;
};

type RawProxyCheckResult = {
  ok?: unknown;
  status_code?: unknown;
  statusCode?: unknown;
  latency_ms?: unknown;
  latencyMs?: unknown;
  message?: unknown;
  error?: unknown;
};

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const normalizeNumber = (value: unknown): number | undefined => {
  const numberValue =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? numberValue : undefined;
};

export const normalizeProxyEntry = (item: RawProxyPoolEntry): ProxyPoolEntry | null => {
  const id = normalizeString(item.id);
  const url = normalizeString(item.url);
  if (!id || !url) return null;
  const name = normalizeString(item.name) || id;
  const description = normalizeString(item.description);
  const maskedUrl = normalizeString(item.masked_url ?? item.maskedUrl);
  return {
    id,
    name,
    url,
    enabled: item.enabled !== false,
    ...(description ? { description } : {}),
    ...(maskedUrl ? { maskedUrl } : {}),
  };
};

export const normalizeProxyCheckResult = (item: RawProxyCheckResult): ProxyCheckResult => {
  const statusCode = normalizeNumber(item.status_code ?? item.statusCode);
  const latencyMs = normalizeNumber(item.latency_ms ?? item.latencyMs);
  const message = normalizeString(item.message ?? item.error);
  const ok =
    typeof item.ok === "boolean"
      ? item.ok
      : typeof statusCode === "number"
        ? statusCode >= 200 && statusCode < 400
        : false;

  return {
    ok,
    ...(typeof statusCode === "number" ? { statusCode } : {}),
    ...(typeof latencyMs === "number" ? { latencyMs: Math.round(latencyMs) } : {}),
    ...(message ? { message } : {}),
  };
};

export const proxiesApi = {
  async list(): Promise<ProxyPoolEntry[]> {
    const data = await apiClient.get<{ items?: RawProxyPoolEntry[] } | RawProxyPoolEntry[]>(
      "/proxy-pool",
    );
    const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    return items.map((item) => normalizeProxyEntry(item)).filter(Boolean) as ProxyPoolEntry[];
  },

  saveAll(entries: ProxyPoolEntry[]) {
    return apiClient.put("/proxy-pool", {
      items: entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        url: entry.url,
        enabled: entry.enabled,
        ...(entry.description ? { description: entry.description } : {}),
      })),
    });
  },

  async check(request: ProxyCheckRequest): Promise<ProxyCheckResult> {
    const data = await apiClient.post<RawProxyCheckResult>(
      "/proxy-pool/check",
      {
        ...(request.id ? { id: request.id } : {}),
        ...(request.url ? { url: request.url } : {}),
        ...(request.testUrl ? { test_url: request.testUrl } : {}),
      },
      { timeoutMs: 12000 },
    );
    return normalizeProxyCheckResult(data ?? {});
  },
};
