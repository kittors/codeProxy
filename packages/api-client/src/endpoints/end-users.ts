import { apiClient } from "../client/client";
import type {
  ApiKeyDailySpendingResetHistoryResponse,
  ApiKeyDailySpendingResetResult,
} from "./api-keys";
import type {
  CappedKey,
  PeriodSpendingItem,
  PeriodSpendingLimits,
  PeriodSpendingLimitsPatch,
  QuotaResetPeriod,
} from "./period-spending";
import {
  legacyQuotaMatrix,
  normalizeCappedCells,
  normalizeModelRoutes,
  normalizeModelRules,
  normalizeQuotaMatrix,
  normalizeQuotaUsageView,
  readAccessPolicyCapabilities,
  type AccessPolicyCapabilities,
  type CappedCell,
  type ModelRoute,
  type ModelRule,
  type QuotaMatrix,
  type QuotaMatrixPatch,
  type QuotaUsageView,
} from "./access-policy";
import { isRecord } from "../client/response";
import {
  buildPortalAccountKey,
  detectApiBaseFromLocation,
  listSavedPortalAccounts,
  portalClient,
  removeSavedPortalAccount,
  type PortalAuthSnapshot,
} from "../client/portal-client";

export interface EndUser {
  id: string;
  tenant_id: string;
  username: string;
  display_name: string;
  status: string;
  must_change_password: boolean;
  last_login_at?: string | null;
  failed_login_count?: number;
  lock_stage?: number;
  locked_until?: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  api_key_count?: number;
  "daily-spending-used"?: number;
  "lifetime-spending-used"?: number;
  "period-spending-limits"?: PeriodSpendingLimits;
  "period-spending"?: PeriodSpendingItem[];
  "capped-keys"?: CappedKey[];
  /** How many times daily spending was manually reset. */
  "daily-spending-reset-count"?: number;
  /** Account-level quota/permissions (shared by all keys). */
  "permission-profile-id"?: string;
  "daily-limit"?: number;
  "total-quota"?: number;
  "spending-limit"?: number;
  "daily-spending-limit"?: number;
  "concurrency-limit"?: number;
  "rpm-limit"?: number;
  "tpm-limit"?: number;
  "allowed-models"?: string[];
  "allowed-channels"?: string[];
  "allowed-channel-groups"?: string[];
  "system-prompt"?: string;
  /**
   * 生效的总额度矩阵、按模型规则与模型路由（绑定模板时就是模板的值）。后端不支持访问策略
   * 时由面板用旧字段拼出矩阵，规则与路由为空。
   */
  "quota-limits": QuotaMatrix;
  "model-rules": ModelRule[];
  "model-routes": ModelRoute[];
  /** 总额度各格与每条规则当前的用量（列表接口填充）。 */
  "quota-usage"?: QuotaUsageView;
  "capped-cells"?: CappedCell[];
}

export type EndUserUpdateBody = {
  username?: string;
  display_name?: string;
  password?: string;
  status?: string;
  "permission-profile-id"?: string;
  "daily-limit"?: number;
  "total-quota"?: number;
  "spending-limit"?: number;
  "daily-spending-limit"?: number;
  "period-spending-limits"?: PeriodSpendingLimitsPatch;
  "concurrency-limit"?: number;
  "rpm-limit"?: number;
  "tpm-limit"?: number;
  "allowed-models"?: string[];
  "allowed-channels"?: string[];
  "allowed-channel-groups"?: string[];
  "system-prompt"?: string;
  "quota-limits"?: QuotaMatrixPatch;
  "model-rules"?: ModelRule[];
  "model-routes"?: ModelRoute[];
};

export interface EndUserDailySpendingResetResult {
  status?: string;
  end_user_id?: string;
  "daily-spending-used"?: number;
  "daily-spending-reset-count"?: number;
  "effective-used-before"?: number;
  "raw-today-cost"?: number;
}

export interface EndUserDailySpendingResetEvent {
  id: number;
  tenant_id?: string;
  end_user_id?: string;
  day_key?: string;
  reset_at: string;
  actor_user_id?: string;
  actor_username?: string;
  actor_kind?: string;
  cost_baseline?: number;
  effective_used_before?: number;
  raw_today_cost?: number;
}

export interface EndUserDailySpendingResetHistoryResponse {
  items: EndUserDailySpendingResetEvent[];
  total: number;
  "raw-today-cost"?: number;
  "daily-spending-used"?: number;
}

export interface EndUserAPIKey {
  id: string;
  tenant_id: string;
  end_user_id: string;
  key?: string;
  key_masked?: string;
  name: string;
  disabled: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
  "daily-spending-limit"?: number;
  "period-spending-limits"?: PeriodSpendingLimits;
  "period-spending"?: PeriodSpendingItem[];
  "daily-spending-used"?: number;
  "lifetime-spending-used"?: number;
  "daily-spending-reset-count"?: number;
  /** Key 的子额度矩阵（每格不超过账号同一格）与 Key 自己的按模型规则。 */
  "quota-limits": QuotaMatrix;
  "model-rules": ModelRule[];
  "quota-usage"?: QuotaUsageView;
}

export interface EndUserAPIKeyMutationBody {
  name?: string;
  "daily-spending-limit"?: number;
  "period-spending-limits"?: PeriodSpendingLimitsPatch;
  "quota-limits"?: QuotaMatrixPatch;
  "model-rules"?: ModelRule[];
  /** 暂停 / 恢复（仅管理端）。 */
  disabled?: boolean;
}

export interface EndUserListResult {
  items: EndUser[];
  capabilities: AccessPolicyCapabilities;
}

export interface EndUserKeyListResult {
  items: EndUserAPIKey[];
  capabilities: AccessPolicyCapabilities;
}

export interface BindPermissionProfileResult {
  updated: number;
  "capped-keys"?: CappedKey[];
  "capped-cells"?: CappedCell[];
}

/**
 * 归一化后端返回的账号：新字段缺失（旧后端）时用旧的扁平字段拼出矩阵，界面只需读一种形态。
 */
export const normalizeEndUser = (raw: unknown): EndUser => {
  const record = (isRecord(raw) ? raw : {}) as Record<string, unknown>;
  const user = record as unknown as EndUser;
  return {
    ...user,
    "quota-limits": isRecord(record["quota-limits"])
      ? normalizeQuotaMatrix(record["quota-limits"])
      : legacyQuotaMatrix({
          periodSpendingLimits: record["period-spending-limits"],
          dailySpendingLimit: record["daily-spending-limit"],
          spendingLimit: record["spending-limit"],
          dailyLimit: record["daily-limit"],
          totalQuota: record["total-quota"],
        }),
    "model-rules": normalizeModelRules(record["model-rules"]),
    "model-routes": normalizeModelRoutes(record["model-routes"]),
    "quota-usage": normalizeQuotaUsageView(record["quota-usage"]),
    "capped-cells": normalizeCappedCells(record["capped-cells"]),
  };
};

export const normalizeEndUserAPIKey = (raw: unknown): EndUserAPIKey => {
  const record = (isRecord(raw) ? raw : {}) as Record<string, unknown>;
  const key = record as unknown as EndUserAPIKey;
  return {
    ...key,
    "quota-limits": isRecord(record["quota-limits"])
      ? normalizeQuotaMatrix(record["quota-limits"])
      : legacyQuotaMatrix({
          periodSpendingLimits: record["period-spending-limits"],
          dailySpendingLimit: record["daily-spending-limit"],
        }),
    "model-rules": normalizeModelRules(record["model-rules"]),
    "quota-usage": normalizeQuotaUsageView(record["quota-usage"]),
  };
};

const readItems = <T>(raw: unknown, normalize: (value: unknown) => T): T[] => {
  const items = isRecord(raw) && Array.isArray(raw.items) ? raw.items : [];
  return items.map(normalize);
};

export interface CreateEndUserResult {
  user: EndUser;
  generated_password?: string;
  default_api_key?: EndUserAPIKey & { key?: string };
}

export interface EndUserAPIKeySecretResult {
  api_key: EndUserAPIKey;
  plaintext_key?: string;
}

export interface PortalLoginResult {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
  refresh_expires_at: string;
  user: EndUser;
  must_change_password: boolean;
}

export const endUsersApi = {
  list: async (): Promise<EndUserListResult> => {
    const raw = await apiClient.get<unknown>("/end-users");
    return {
      items: readItems(raw, normalizeEndUser),
      capabilities: readAccessPolicyCapabilities(isRecord(raw) ? raw.capabilities : undefined),
    };
  },
  create: async (body: {
    username?: string;
    display_name: string;
    password?: string;
    /** 只在后端声明 create-with-profile 时提交。 */
    "permission-profile-id"?: string;
  }): Promise<CreateEndUserResult> => {
    const result = await apiClient.post<CreateEndUserResult>("/end-users", body);
    return { ...result, user: normalizeEndUser(result.user) };
  },
  update: async (id: string, body: EndUserUpdateBody): Promise<EndUser> =>
    normalizeEndUser(await apiClient.patch<unknown>(`/end-users/${id}`, body)),
  /** 把一批账号绑定到同一个权限模板（后端 batch-profile-binding 能力）。 */
  bindProfile: (ids: string[], profileId: string) =>
    apiClient.post<BindPermissionProfileResult>("/end-users/batch/permission-profile", {
      ids,
      "permission-profile-id": profileId,
    }),
  remove: (id: string) => apiClient.delete(`/end-users/${id}`),
  resetPassword: (id: string, password?: string) =>
    apiClient.post<{ generated_password?: string }>(`/end-users/${id}/reset-password`, {
      password: password || "",
    }),
  resetDailySpending: (id: string) =>
    apiClient.post<EndUserDailySpendingResetResult>(`/end-users/${id}/daily-spending/reset`, {}),
  resetPeriodSpending: (id: string, periods: QuotaResetPeriod[]) =>
    apiClient.post<unknown>(`/end-users/${id}/period-spending/reset`, { periods }),
  listDailySpendingResetHistory: (id: string, limit?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return apiClient.get<EndUserDailySpendingResetHistoryResponse>(
      `/end-users/${id}/daily-spending/reset-history${suffix}`,
    );
  },
  listKeys: async (id: string): Promise<EndUserKeyListResult> => {
    const raw = await apiClient.get<unknown>(`/end-users/${id}/api-keys`);
    return {
      items: readItems(raw, normalizeEndUserAPIKey),
      capabilities: readAccessPolicyCapabilities(isRecord(raw) ? raw.capabilities : undefined),
    };
  },
  createKey: (id: string, body: EndUserAPIKeyMutationBody) =>
    apiClient.post<EndUserAPIKeySecretResult>(`/end-users/${id}/api-keys`, body),
  updateKey: async (userId: string, keyId: string, body: EndUserAPIKeyMutationBody) =>
    normalizeEndUserAPIKey(
      await apiClient.patch<unknown>(`/end-users/${userId}/api-keys/${keyId}`, body),
    ),
  /** 按需取一把 Key 的明文（复制用），不再为此拉取整个租户的明文列表。 */
  keySecret: (userId: string, keyId: string) =>
    apiClient.get<{ id: string; key: string }>(`/end-users/${userId}/api-keys/${keyId}/secret`),
  updateKeyName: (userId: string, keyId: string, name: string) =>
    apiClient.patch<EndUserAPIKey>(`/end-users/${userId}/api-keys/${keyId}`, { name }),
  resetKeyDailySpending: (userId: string, keyId: string) =>
    apiClient.post<ApiKeyDailySpendingResetResult>(
      `/end-users/${userId}/api-keys/${keyId}/daily-spending/reset`,
      {},
    ),
  /** 支持访问策略的后端也接受 lifetime（Key 上配了累计格子时）。 */
  resetKeyPeriodSpending: (userId: string, keyId: string, periods: QuotaResetPeriod[]) =>
    apiClient.post<unknown>(`/end-users/${userId}/api-keys/${keyId}/period-spending/reset`, {
      periods,
    }),
  listKeyDailySpendingResetHistory: (userId: string, keyId: string, limit?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return apiClient.get<ApiKeyDailySpendingResetHistoryResponse>(
      `/end-users/${userId}/api-keys/${keyId}/daily-spending/reset-history${suffix}`,
    );
  },
  rotateKey: (userId: string, keyId: string) =>
    apiClient.post<EndUserAPIKeySecretResult>(`/end-users/${userId}/api-keys/${keyId}/rotate`, {}),
  deleteKey: (userId: string, keyId: string) =>
    apiClient.delete(`/end-users/${userId}/api-keys/${keyId}`),
};

/** One sign-in as shown to the end user: recognisable, not a recon feed. */
export interface PortalAttempt {
  occurred_at: string;
  /** Partially masked; enough to recognise a location, not to enumerate one. */
  ip: string;
  outcome: string;
  user_agent: string;
}

export interface PortalAttemptsResponse {
  items: PortalAttempt[];
  total: number;
  page: number;
  size: number;
}

export const portalApi = {
  client: portalClient,
  loadSession: () => portalClient.loadFromStorage(),
  clearSession: () => portalClient.clearSession(),
  listSavedAccounts: () => listSavedPortalAccounts(),
  removeSavedAccount: (accountKeyOrId: string) => removeSavedPortalAccount(accountKeyOrId),
  beginAddAccount: () => {
    portalClient.parkSession();
  },
  switchAccount: (accountKeyOrId: string) => portalClient.switchToSavedAccount(accountKeyOrId),
  async login(username: string, password: string, remember = true): Promise<PortalLoginResult> {
    portalClient.loadFromStorage();
    const result = await portalClient.post<PortalLoginResult>("/v0/portal/auth/login", {
      username,
      password,
    });
    const snap: PortalAuthSnapshot = {
      apiBase: detectApiBaseFromLocation(),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      remember,
      expiresAt: Date.parse(result.expires_at) || Date.now() + 12 * 3600 * 1000,
      user: {
        id: result.user.id,
        username: result.user.username,
        display_name: result.user.display_name,
      },
    };
    portalClient.setSession(snap);
    return { ...result, user: normalizeEndUser(result.user) };
  },
  logout: async () => {
    const current = portalClient.loadFromStorage();
    try {
      await portalClient.post("/v0/portal/auth/logout", {});
    } catch {
      /* ignore */
    }
    if (current?.user?.id) {
      removeSavedPortalAccount(buildPortalAccountKey(current.apiBase, current.user.id));
    }
    portalClient.clearSession();
  },
  me: async (): Promise<{ user: EndUser; capabilities: AccessPolicyCapabilities }> => {
    const raw = await portalClient.get<unknown>("/v0/portal/auth/me");
    const record = isRecord(raw) ? raw : {};
    return {
      user: normalizeEndUser(record.user),
      capabilities: readAccessPolicyCapabilities(record.capabilities),
    };
  },
  /**
   * The caller's own sign-in history. The server derives the account from the
   * session, so this can only ever return the current user's records.
   */
  attempts: (params?: { page?: number; size?: number }) =>
    portalClient.get<PortalAttemptsResponse>(
      `/v0/portal/auth/attempts?page=${params?.page ?? 1}&size=${params?.size ?? 20}`,
    ),
  changePassword: (current_password: string, new_password: string) =>
    portalClient.put<void>("/v0/portal/auth/password", { current_password, new_password }),
  listKeys: async (): Promise<EndUserKeyListResult> => {
    const raw = await portalClient.get<unknown>("/v0/portal/api-keys");
    return {
      items: readItems(raw, normalizeEndUserAPIKey),
      capabilities: readAccessPolicyCapabilities(isRecord(raw) ? raw.capabilities : undefined),
    };
  },
  keySecret: (id: string) =>
    portalClient.get<{ id: string; key: string }>(`/v0/portal/api-keys/${id}/secret`),
  createKey: (body: EndUserAPIKeyMutationBody) =>
    portalClient.post<{ api_key: EndUserAPIKey; plaintext_key?: string }>(
      "/v0/portal/api-keys",
      body,
    ),
  updateKey: async (id: string, body: EndUserAPIKeyMutationBody) =>
    normalizeEndUserAPIKey(await portalClient.patch<unknown>(`/v0/portal/api-keys/${id}`, body)),
  resetKeyPeriodSpending: (id: string, periods: QuotaResetPeriod[]) =>
    portalClient.post<unknown>(`/v0/portal/api-keys/${id}/period-spending/reset`, { periods }),
  rotateKey: (id: string) =>
    portalClient.post<{ api_key: EndUserAPIKey; plaintext_key?: string }>(
      `/v0/portal/api-keys/${id}/rotate`,
      {},
    ),
  deleteKey: (id: string) => portalClient.delete(`/v0/portal/api-keys/${id}`),
};
