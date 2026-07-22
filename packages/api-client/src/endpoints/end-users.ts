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
} from "./period-spending";
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
}

export interface EndUserAPIKeyMutationBody {
  name?: string;
  "daily-spending-limit"?: number;
  "period-spending-limits"?: PeriodSpendingLimitsPatch;
}

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
  list: () => apiClient.get<{ items: EndUser[] }>("/end-users"),
  create: (body: { username?: string; display_name: string; password?: string }) =>
    apiClient.post<CreateEndUserResult>("/end-users", body),
  update: (id: string, body: EndUserUpdateBody) =>
    apiClient.patch<EndUser>(`/end-users/${id}`, body),
  remove: (id: string) => apiClient.delete(`/end-users/${id}`),
  resetPassword: (id: string, password?: string) =>
    apiClient.post<{ generated_password?: string }>(`/end-users/${id}/reset-password`, {
      password: password || "",
    }),
  resetDailySpending: (id: string) =>
    apiClient.post<EndUserDailySpendingResetResult>(`/end-users/${id}/daily-spending/reset`, {}),
  listDailySpendingResetHistory: (id: string, limit?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return apiClient.get<EndUserDailySpendingResetHistoryResponse>(
      `/end-users/${id}/daily-spending/reset-history${suffix}`,
    );
  },
  listKeys: (id: string) => apiClient.get<{ items: EndUserAPIKey[] }>(`/end-users/${id}/api-keys`),
  createKey: (id: string, body: EndUserAPIKeyMutationBody) =>
    apiClient.post<EndUserAPIKeySecretResult>(`/end-users/${id}/api-keys`, body),
  updateKey: (userId: string, keyId: string, body: EndUserAPIKeyMutationBody) =>
    apiClient.patch<EndUserAPIKey>(`/end-users/${userId}/api-keys/${keyId}`, body),
  updateKeyName: (userId: string, keyId: string, name: string) =>
    apiClient.patch<EndUserAPIKey>(`/end-users/${userId}/api-keys/${keyId}`, { name }),
  resetKeyDailySpending: (userId: string, keyId: string) =>
    apiClient.post<ApiKeyDailySpendingResetResult>(
      `/end-users/${userId}/api-keys/${keyId}/daily-spending/reset`,
      {},
    ),
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
    return result;
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
  me: () => portalClient.get<{ user: EndUser }>("/v0/portal/auth/me"),
  changePassword: (current_password: string, new_password: string) =>
    portalClient.put<void>("/v0/portal/auth/password", { current_password, new_password }),
  listKeys: () => portalClient.get<{ items: EndUserAPIKey[] }>("/v0/portal/api-keys"),
  keySecret: (id: string) =>
    portalClient.get<{ id: string; key: string }>(`/v0/portal/api-keys/${id}/secret`),
  createKey: (body: EndUserAPIKeyMutationBody) =>
    portalClient.post<{ api_key: EndUserAPIKey; plaintext_key?: string }>(
      "/v0/portal/api-keys",
      body,
    ),
  updateKey: (id: string, body: EndUserAPIKeyMutationBody) =>
    portalClient.patch<EndUserAPIKey>(`/v0/portal/api-keys/${id}`, body),
  resetKeyDailySpending: (id: string) =>
    portalClient.post<ApiKeyDailySpendingResetResult>(
      `/v0/portal/api-keys/${id}/daily-spending/reset`,
      {},
    ),
  listKeyDailySpendingResetHistory: (id: string, limit?: number) => {
    const query = new URLSearchParams();
    if (limit != null) query.set("limit", String(limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return portalClient.get<ApiKeyDailySpendingResetHistoryResponse>(
      `/v0/portal/api-keys/${id}/daily-spending/reset-history${suffix}`,
    );
  },
  rotateKey: (id: string) =>
    portalClient.post<{ api_key: EndUserAPIKey; plaintext_key?: string }>(
      `/v0/portal/api-keys/${id}/rotate`,
      {},
    ),
  deleteKey: (id: string) => portalClient.delete(`/v0/portal/api-keys/${id}`),
};
