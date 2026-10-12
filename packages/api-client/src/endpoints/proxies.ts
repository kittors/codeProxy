import { apiClient } from "../client/client";
import {
  normalizeResourceSharing,
  normalizeSharingCapability,
  normalizeTenantRefs,
  toSharingRequestBody,
  type ResourceSharing,
  type ResourceSharingCapability,
  type ResourceSharingInput,
  type TenantRef,
} from "./resource-sharing";

export interface ProxyPoolEntry {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
  maskedUrl?: string;
  /**
   * 平台共享给本租户的条目（只在 listSelectable 的结果里出现）：只读，url 为空、只有 maskedUrl，
   * 账号按 ID 引用它，检测也只能按 ID 在服务端做。
   */
  shared?: boolean;
  /** 系统租户视角：这条代理共享给了谁；未共享时没有。 */
  sharing?: ResourceSharing;
  /** 系统租户视角：已被授权、但仍用自己同 ID 代理覆盖了它的租户。 */
  overriddenBy?: TenantRef[];
}

/** 平台共享给本租户的代理（非系统租户视角）。没有 url：地址和凭据只留在平台。 */
export interface SharedProxyEntry {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  maskedUrl: string;
  /** 本租户有同 ID 的自有代理，账号实际用的是自有那条。 */
  overridden: boolean;
}

export interface ProxyPoolListing {
  /** 本租户自己的代理。只有它们能编辑；PUT /proxy-pool 整表替换也只能提交它们。 */
  items: ProxyPoolEntry[];
  /** 平台共享给本租户的代理；系统租户、旧后端都是空数组。 */
  sharedItems: SharedProxyEntry[];
  sharing: ResourceSharingCapability;
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

export interface ProxyPoolUpdateInput {
  name: string;
  url: string;
  enabled: boolean;
  description?: string;
}

type RawProxyPoolEntry = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  enabled?: unknown;
  description?: unknown;
  masked_url?: unknown;
  maskedUrl?: unknown;
  sharing?: unknown;
  overridden_by?: unknown;
};

type RawSharedProxyEntry = {
  id?: unknown;
  name?: unknown;
  enabled?: unknown;
  description?: unknown;
  masked_url?: unknown;
  overridden?: unknown;
};

type RawProxyPoolResponse =
  | { items?: RawProxyPoolEntry[]; shared_items?: RawSharedProxyEntry[]; sharing?: unknown }
  | RawProxyPoolEntry[];

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
  const sharing = normalizeResourceSharing(item.sharing);
  const overriddenBy = normalizeTenantRefs(item.overridden_by);
  return {
    id,
    name,
    url,
    enabled: item.enabled !== false,
    ...(description ? { description } : {}),
    ...(maskedUrl ? { maskedUrl } : {}),
    ...(sharing ? { sharing } : {}),
    ...(overriddenBy.length > 0 ? { overriddenBy } : {}),
  };
};

export const normalizeSharedProxyEntry = (item: RawSharedProxyEntry): SharedProxyEntry | null => {
  const id = normalizeString(item.id);
  if (!id) return null;
  const description = normalizeString(item.description);
  return {
    id,
    name: normalizeString(item.name) || id,
    enabled: item.enabled !== false,
    ...(description ? { description } : {}),
    maskedUrl: normalizeString(item.masked_url),
    overridden: item.overridden === true,
  };
};

/**
 * GET /proxy-pool → 自有条目 + 共享条目 + 能力。后端不支持共享时（旧后端、没有数据库）把
 * 共享相关的字段全部剥掉，界面据此整体降级，不会出现半截共享信息。
 */
export const normalizeProxyPoolListing = (data: RawProxyPoolResponse | null | undefined): ProxyPoolListing => {
  const body = data && !Array.isArray(data) ? data : null;
  const rawItems = Array.isArray(data) ? data : Array.isArray(body?.items) ? body.items : [];
  const sharing = normalizeSharingCapability(body?.sharing);
  const items = rawItems
    .map((item) => normalizeProxyEntry(item))
    .filter((item): item is ProxyPoolEntry => item !== null)
    .map((item) => {
      if (sharing.supported) return item;
      const { sharing: _sharing, overriddenBy: _overriddenBy, ...rest } = item;
      return rest;
    });
  const sharedItems =
    sharing.supported && Array.isArray(body?.shared_items)
      ? body.shared_items
          .map((item) => normalizeSharedProxyEntry(item))
          .filter((item): item is SharedProxyEntry => item !== null)
      : [];
  return { items, sharedItems, sharing };
};

/**
 * 代理 ID 的比较键，与后端 config.NormalizeProxyID 同一规则：小写，非字母数字的连续字符折成
 * 一个 "-"，去掉首尾的 "-"。后端判断「同 ID 覆盖」用的就是它。
 */
export const proxyIdKey = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/**
 * 代理下拉的可选项：自有代理在前，再接上没被本租户同 ID 代理覆盖的共享代理（覆盖了的，选这个 ID
 * 用的就是自有那条，再列一次只会让人以为有两条）。共享条目没有地址，只带打码后的 maskedUrl。
 */
export const selectableProxyEntries = (listing: ProxyPoolListing): ProxyPoolEntry[] => {
  const ownIds = new Set(listing.items.map((item) => proxyIdKey(item.id)));
  const shared = listing.sharedItems
    .filter((item) => !item.overridden && !ownIds.has(proxyIdKey(item.id)))
    .map<ProxyPoolEntry>((item) => ({
      id: item.id,
      name: item.name,
      url: "",
      enabled: item.enabled,
      ...(item.description ? { description: item.description } : {}),
      ...(item.maskedUrl ? { maskedUrl: item.maskedUrl } : {}),
      shared: true,
    }));
  return [...listing.items, ...shared];
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
  /** 只返回本租户自己的代理（契约不变）。要共享信息用 listWithSharing，给下拉用 listSelectable。 */
  async list(): Promise<ProxyPoolEntry[]> {
    const data = await apiClient.get<{ items?: RawProxyPoolEntry[] } | RawProxyPoolEntry[]>(
      "/proxy-pool",
    );
    const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
    return items.map((item) => normalizeProxyEntry(item)).filter(Boolean) as ProxyPoolEntry[];
  },

  async listWithSharing(): Promise<ProxyPoolListing> {
    return normalizeProxyPoolListing(await apiClient.get<RawProxyPoolResponse>("/proxy-pool"));
  },

  /** 所有代理选择下拉都用它：自有 + 可用的平台共享代理。 */
  async listSelectable(): Promise<ProxyPoolEntry[]> {
    return selectableProxyEntries(await proxiesApi.listWithSharing());
  },

  /**
   * 整表替换本租户的代理。只能传自有条目——平台共享条目混进来，就会被复制成租户自己的一份。
   * 共享相关的展示字段（sharing、overriddenBy）不写回。
   */
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

  update(id: string, entry: ProxyPoolUpdateInput) {
    return apiClient.patch(`/proxy-pool/${encodeURIComponent(id)}`, {
      name: entry.name,
      url: entry.url,
      enabled: entry.enabled,
      ...(entry.description ? { description: entry.description } : {}),
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

  /** 系统租户的代理共享给谁（平台管理员、系统租户视角）；都为空表示取消共享。 */
  async updateSharing(id: string, input: ResourceSharingInput): Promise<ResourceSharing | null> {
    const data = await apiClient.put<{ sharing?: unknown }>(
      `/proxy-pool/${encodeURIComponent(id)}/sharing`,
      toSharingRequestBody(input),
    );
    return normalizeResourceSharing(data?.sharing);
  },

  /**
   * 让「已被授权、但用同 ID 自有代理覆盖了共享代理」的租户改用共享版本：删掉它们的自有条目。
   * 账号按 ID 引用代理，不需要改账号。返回实际切换了的租户。
   */
  async adopt(id: string): Promise<TenantRef[]> {
    const data = await apiClient.post<{ tenants?: unknown }>(
      `/proxy-pool/${encodeURIComponent(id)}/adopt`,
    );
    return normalizeTenantRefs(data?.tenants);
  },
};
