import type { ProxyPoolEntry } from "@/lib/http/apis/proxies";

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

