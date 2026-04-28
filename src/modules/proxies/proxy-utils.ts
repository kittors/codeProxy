import type { ProxyCheckResult, ProxyPoolEntry } from "@/lib/http/apis/proxies";

export type ProxyCheckStateEntry = Partial<ProxyCheckResult> & { checking?: boolean };
export type ProxyCheckState = Record<string, ProxyCheckStateEntry>;

export type ProxyLatencyTone = "none" | "fast" | "medium" | "slow" | "failed";

export const PROXIES_CHECK_STATE_CACHE_KEY = "proxiesPage.checkState.v1";

const readCachedNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;

export const emptyProxyDraft = (): ProxyPoolEntry => ({
  id: "",
  name: "",
  url: "",
  enabled: true,
  description: "",
});

export const proxyProtocol = (rawUrl: string): string => {
  const match = rawUrl.trim().match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return match?.[1]?.toUpperCase() ?? "PROXY";
};

export const proxyDisplayURL = (entry: ProxyPoolEntry): string => entry.maskedUrl || entry.url;

export const proxyEndpoint = (entry: ProxyPoolEntry): string => {
  const raw = (entry.maskedUrl || entry.url).trim();
  try {
    const url = new URL(raw);
    const host = url.hostname;
    const port = url.port;
    if (host) return port ? `${host}:${port}` : host;
  } catch {
    // 兼容不完整但仍可从字符串中取 host 的旧数据。
  }
  const withoutProtocol = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutAuth = withoutProtocol.includes("@")
    ? (withoutProtocol.split("@").pop() ?? "")
    : withoutProtocol;
  return withoutAuth.split(/[/?#]/)[0] || "--";
};

export const proxyLatencyTone = (result?: ProxyCheckStateEntry): ProxyLatencyTone => {
  if (!result || typeof result.ok !== "boolean") return "none";
  if (!result.ok) return "failed";
  if (typeof result.latencyMs !== "number") return "none";
  if (result.latencyMs <= 300) return "fast";
  if (result.latencyMs <= 1000) return "medium";
  return "slow";
};

export const readCachedProxyCheckState = (): ProxyCheckState => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PROXIES_CHECK_STATE_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const next: ProxyCheckState = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!id || !value || typeof value !== "object" || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (typeof item.ok !== "boolean") continue;
      const statusCode = readCachedNumber(item.statusCode);
      const latencyMs = readCachedNumber(item.latencyMs);
      const message = typeof item.message === "string" ? item.message : "";
      next[id] = {
        ok: item.ok,
        ...(typeof statusCode === "number" ? { statusCode } : {}),
        ...(typeof latencyMs === "number" ? { latencyMs } : {}),
        ...(message ? { message } : {}),
      };
    }
    return next;
  } catch {
    return {};
  }
};

export const writeCachedProxyCheckState = (state: ProxyCheckState) => {
  if (typeof window === "undefined") return;
  try {
    const cache: Record<string, ProxyCheckResult> = {};
    for (const [id, result] of Object.entries(state)) {
      if (typeof result.ok !== "boolean") continue;
      cache[id] = {
        ok: result.ok,
        ...(typeof result.statusCode === "number" ? { statusCode: result.statusCode } : {}),
        ...(typeof result.latencyMs === "number" ? { latencyMs: result.latencyMs } : {}),
        ...(result.message ? { message: result.message } : {}),
      };
    }
    window.sessionStorage.setItem(PROXIES_CHECK_STATE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 忽略缓存写入失败。
  }
};

export const slugifyProxyID = (name: string, fallback: string): string => {
  const base = (name || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `proxy-${Date.now()}`;
};

export const validateProxyDraft = (draft: ProxyPoolEntry): string | null => {
  if (!draft.name.trim()) return "name";
  if (!draft.url.trim()) return "url";
  if (!/^(https?|socks5):\/\/[^/\s]+/i.test(draft.url.trim())) return "url";
  return null;
};
