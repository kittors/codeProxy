import { apiClient } from "../client/client";
import { portalClient } from "../client/portal-client";
import { isRecord } from "../client/response";

/**
 * 门户账号按上游的访问冻结（CliRelay `/end-users/access-freezes…`、`/v0/portal/access-freezes`）。
 *
 * 上游以内容安全为由拒绝一次请求（目前是 Codex 的 `cyber_policy`），网关就按租户设的阈值冻结发起
 * 请求的一方对这个上游的使用权限：门户账号冻结的是账号名下所有 Key，不属于任何门户账号的 Key 冻结
 * Key 本身。只冻出事的那一类上游，其他上游照常可用；解冻由管理员手动做，不会到期自动解冻。
 *
 * 面板会从最新 release 自动更新、可能连着没有这个功能的旧后端，所以只有 `GET /end-users` 和门户
 * `GET /v0/portal/auth/me` 的 capabilities 声明 `access-freezes`（`AccessPolicyCapabilities.accessFreezes`）
 * 时才请求这些接口。
 *
 * 管理接口的权限与租户作用域同门户账号（end_users.read / end_users.write）；没有数据库的后端回 503
 * `access_freezes_unavailable`。
 */

/** 冻结的对象：门户账号，或不属于任何门户账号的 API Key。 */
export type AccessFreezeSubjectKind = "end_user" | "api_key";

export interface AccessFreezeSubject {
  tenant_id: string;
  /** 后端只增不改；不认识的值原样保留。 */
  kind: AccessFreezeSubjectKind | string;
  /** end_user 时是门户账号 id，api_key 时是 Key 的 id。 */
  id: string;
}

export interface AccessFreeze {
  id: number;
  subject: AccessFreezeSubject;
  /** 后端解析的被冻结方名称：门户账号的显示名（或用户名）、Key 的名字；旧后端或已删除时为空串。 */
  subject_name: string;
  /** 上游类型（codex、claude、gemini……）。运营者自命名的 OpenAI 兼容上游也有值，但不属于任何厂商名。 */
  provider: string;
  /** 厂商名（Codex）；运营者自命名的上游为空，界面写「其他上游」。 */
  provider_name: string;
  /** 触发冻结的拒绝码，例如 cyber_policy。 */
  reason_code: string;
  /** 上游的原话。 */
  upstream_message: string;
  model: string;
  /** 拒绝该请求的上游账号：只在管理端看得到。 */
  auth_label?: string;
  request_id?: string;
  /** 冻结时及之后累计的拒绝次数。 */
  strike_count: number;
  frozen_at: string;
  /** 未解冻时缺省。 */
  released_at?: string;
  released_by?: string;
  release_note?: string;
  /** 网关回给被冻结方的说明全文（中英双语）。 */
  notice: string;
}

/** 每一次被上游拒绝的证据。 */
export interface AccessFreezeStrike {
  id: number;
  subject: AccessFreezeSubject;
  provider: string;
  provider_name: string;
  reason_code: string;
  upstream_message: string;
  model: string;
  auth_label?: string;
  request_id?: string;
  created_at: string;
}

/** 租户的冻结阈值：从上次解冻起，被上游拒绝几次就冻结；0 只记录不冻结。 */
export interface AccessFreezeSettings {
  threshold: number;
  default_threshold: number;
  max_threshold: number;
}

export type AccessFreezeStatus = "active" | "released" | "all";

export interface AccessFreezeQuery {
  /** 缺省按后端的默认（all）。 */
  status?: AccessFreezeStatus;
  subjectKind?: AccessFreezeSubjectKind;
  subjectId?: string;
  provider?: string;
  limit?: number;
}

export interface AccessFreezeStrikeQuery {
  /** 后端要求两项都给，缺一回 400 invalid_subject。 */
  subjectKind: AccessFreezeSubjectKind;
  subjectId: string;
  provider?: string;
  limit?: number;
}

/**
 * 门户用户看到的自己名下的冻结。不含上游账号和请求 ID（门户不暴露渠道身份）；运营者自命名的上游，
 * provider 和 provider_name 都是空串。
 */
export interface PortalAccessFreeze {
  provider: string;
  provider_name: string;
  reason_code: string;
  model: string;
  frozen_at: string;
  notice: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const optionalText = (value: unknown): string | undefined => {
  const trimmed = text(value).trim();
  return trimmed ? trimmed : undefined;
};

const wholeNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
};

function normalizeSubject(raw: unknown): AccessFreezeSubject | null {
  if (!isRecord(raw)) return null;
  const id = text(raw.id).trim();
  const kind = text(raw.kind).trim();
  if (!id || !kind) return null;
  return { tenant_id: text(raw.tenant_id), kind, id };
}

/** 一条冻结；缺 id 或对象时不是冻结（旧后端、代理页），返回 null。 */
export function normalizeAccessFreeze(raw: unknown): AccessFreeze | null {
  if (!isRecord(raw)) return null;
  const id = wholeNumber(raw.id);
  const subject = normalizeSubject(raw.subject);
  if (id === 0 || !subject) return null;
  return {
    id,
    subject,
    subject_name: text(raw.subject_name).trim(),
    provider: text(raw.provider),
    provider_name: text(raw.provider_name),
    reason_code: text(raw.reason_code),
    upstream_message: text(raw.upstream_message),
    model: text(raw.model),
    auth_label: optionalText(raw.auth_label),
    request_id: optionalText(raw.request_id),
    strike_count: wholeNumber(raw.strike_count),
    frozen_at: text(raw.frozen_at),
    released_at: optionalText(raw.released_at),
    released_by: optionalText(raw.released_by),
    release_note: optionalText(raw.release_note),
    notice: text(raw.notice),
  };
}

export function normalizeAccessFreezeStrike(raw: unknown): AccessFreezeStrike | null {
  if (!isRecord(raw)) return null;
  const id = wholeNumber(raw.id);
  const subject = normalizeSubject(raw.subject);
  if (id === 0 || !subject) return null;
  return {
    id,
    subject,
    provider: text(raw.provider),
    provider_name: text(raw.provider_name),
    reason_code: text(raw.reason_code),
    upstream_message: text(raw.upstream_message),
    model: text(raw.model),
    auth_label: optionalText(raw.auth_label),
    request_id: optionalText(raw.request_id),
    created_at: text(raw.created_at),
  };
}

/** 设置响应；缺阈值（不是这个功能的后端）时为 null。 */
export function normalizeAccessFreezeSettings(raw: unknown): AccessFreezeSettings | null {
  if (!isRecord(raw)) return null;
  const { threshold } = raw;
  if (typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 0) return null;
  return {
    threshold,
    default_threshold: wholeNumber(raw.default_threshold),
    max_threshold: wholeNumber(raw.max_threshold),
  };
}

export function normalizePortalAccessFreeze(raw: unknown): PortalAccessFreeze | null {
  if (!isRecord(raw)) return null;
  const notice = text(raw.notice);
  const frozenAt = text(raw.frozen_at);
  // 没有说明也没有时间的不是门户的冻结：界面逐条显示说明，空的一条没有意义。
  if (!notice && !frozenAt) return null;
  return {
    provider: text(raw.provider),
    provider_name: text(raw.provider_name),
    reason_code: text(raw.reason_code),
    model: text(raw.model),
    frozen_at: frozenAt,
    notice,
  };
}

const readItems = <T>(raw: unknown, normalize: (value: unknown) => T | null): T[] => {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.map(normalize).filter((item): item is T => item !== null);
};

const queryString = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const built = query.toString();
  return built ? `?${built}` : "";
};

/** 写入的响应本该是这个功能的形状；不是时说明连着的不是它的后端，写入结果无从确认。 */
const unexpected = (what: string) => new Error(`Unexpected response to ${what}`);

const PATH = "/end-users/access-freezes";

interface ReadOptions {
  signal?: AbortSignal;
}

export const accessFreezesApi = {
  /** 本租户的冻结，按冻结时间倒序。 */
  async list(query: AccessFreezeQuery = {}, options?: ReadOptions): Promise<AccessFreeze[]> {
    const raw = await apiClient.get<unknown>(
      `${PATH}${queryString({
        status: query.status,
        subject_kind: query.subjectKind,
        subject_id: query.subjectId,
        provider: query.provider,
        limit: query.limit,
      })}`,
      options,
    );
    return readItems(raw, normalizeAccessFreeze);
  },

  /** 一方被上游拒绝过的每一次，按时间倒序：冻结所依据的证据。 */
  async strikes(
    query: AccessFreezeStrikeQuery,
    options?: ReadOptions,
  ): Promise<AccessFreezeStrike[]> {
    const raw = await apiClient.get<unknown>(
      `${PATH}/strikes${queryString({
        subject_kind: query.subjectKind,
        subject_id: query.subjectId,
        provider: query.provider,
        limit: query.limit,
      })}`,
      options,
    );
    return readItems(raw, normalizeAccessFreezeStrike);
  },

  /**
   * 解冻。被冻结方从下一次请求起就能再用这个上游；之后的拒绝次数重新累计。
   * 已经解冻的回 409 access_freeze_already_released，不存在的回 404 access_freeze_not_found。
   */
  async release(id: number, note?: string): Promise<AccessFreeze> {
    const trimmed = note?.trim() ?? "";
    const raw = await apiClient.post<unknown>(
      `${PATH}/${id}/release`,
      trimmed ? { note: trimmed } : {},
    );
    const freeze = normalizeAccessFreeze(isRecord(raw) ? raw.freeze : undefined);
    if (!freeze) throw unexpected("an access freeze release");
    return freeze;
  },

  getSettings: async (options?: ReadOptions): Promise<AccessFreezeSettings> => {
    const settings = normalizeAccessFreezeSettings(
      await apiClient.get<unknown>(`${PATH}/settings`, options),
    );
    if (!settings) throw unexpected("the access freeze settings");
    return settings;
  },

  /** 阈值 0..max_threshold；越界回 400 invalid_threshold。 */
  putSettings: async (threshold: number): Promise<AccessFreezeSettings> => {
    const settings = normalizeAccessFreezeSettings(
      await apiClient.put<unknown>(`${PATH}/settings`, { threshold }),
    );
    if (!settings) throw unexpected("an access freeze threshold write");
    return settings;
  },
};

/**
 * 门户（/v0/portal/access-freezes）：当前登录的门户用户自己名下生效中的冻结，服务器按会话定范围。
 * 只在 /v0/portal/auth/me 的 capabilities 声明 `access-freezes` 时请求，旧后端没有这个接口。
 */
export const portalAccessFreezesApi = {
  async list(options?: ReadOptions): Promise<PortalAccessFreeze[]> {
    const raw = await portalClient.get<unknown>("/v0/portal/access-freezes", options);
    return readItems(raw, normalizePortalAccessFreeze);
  },
};
