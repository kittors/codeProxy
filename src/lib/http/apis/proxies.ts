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

const normalizeString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

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

  check(request: ProxyCheckRequest): Promise<ProxyCheckResult> {
    return apiClient.post(
      "/proxy-pool/check",
      {
        ...(request.id ? { id: request.id } : {}),
        ...(request.url ? { url: request.url } : {}),
        ...(request.testUrl ? { test_url: request.testUrl } : {}),
      },
      { timeoutMs: 12000 },
    );
  },
};

