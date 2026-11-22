import { apiClient } from "../client/client";
import { portalClient } from "../client/portal-client";
import { publicApiClient } from "../client/public-client";

export type BillingPlanKind = "subscription" | "quota_pack" | "custom_quota" | "daily_reset";
export type BillingTargetKind = "end_user" | "api_key";
export type BillingPayChannel = "wechat" | "alipay" | "manual";
export type BillingOrderStatus =
  | "pending"
  | "paid"
  | "fulfilled"
  | "failed"
  | "expired"
  | "closed";

export interface BillingSettings {
  enabled: boolean;
  provider: string;
  public_base_url: string;
  xunhu_gateway_url: string;
  xunhu_query_url: string;
  xunhu_wechat_enabled: boolean;
  xunhu_wechat_appid: string;
  xunhu_wechat_appsecret: string;
  xunhu_wechat_has_secret: boolean;
  xunhu_alipay_enabled: boolean;
  xunhu_alipay_appid: string;
  xunhu_alipay_appsecret: string;
  xunhu_alipay_has_secret: boolean;
  order_expire_minutes: number;
  currency: string;
  wechat_notify_url: string;
  alipay_notify_url: string;
  persistent: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface BillingSettingsUpdate {
  enabled?: boolean;
  provider?: string;
  public_base_url?: string;
  xunhu_gateway_url?: string;
  xunhu_query_url?: string;
  xunhu_wechat_enabled?: boolean;
  xunhu_wechat_appid?: string;
  xunhu_wechat_appsecret?: string;
  xunhu_alipay_enabled?: boolean;
  xunhu_alipay_appid?: string;
  xunhu_alipay_appsecret?: string;
  order_expire_minutes?: number;
}

export interface BillingTestChannelRequest {
  channel: "wechat" | "alipay";
  gateway_url?: string;
  query_url?: string;
  appid?: string;
  appsecret?: string;
}

export interface BillingTestChannelResult {
  channel: string;
  ok: boolean;
  message: string;
  duration_ms: number;
}

export interface BillingPlan {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  kind: BillingPlanKind;
  price_cents: number;
  duration_days: number;
  quota_amount_usd: number;
  quota_requests: number;
  quota_tokens: number;
  rate_usd_per_cny: number;
  min_amount_cents: number;
  max_amount_cents: number;
  permission_profile_id: string;
  badge: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingPlanInput {
  name: string;
  description: string;
  kind: BillingPlanKind;
  price_cents: number;
  duration_days: number;
  quota_amount_usd: number;
  quota_requests: number;
  quota_tokens: number;
  rate_usd_per_cny: number;
  min_amount_cents: number;
  max_amount_cents: number;
  permission_profile_id: string;
  badge: string;
  sort_order: number;
  enabled: boolean;
}

export interface BillingBinding {
  id: string;
  tenant_id: string;
  target_kind: BillingTargetKind;
  target_id: string;
  end_user_id: string;
  enabled: boolean;
  plan_ids: string[];
  price_overrides: Record<string, number>;
  public_code: string;
  allow_public_pay: boolean;
  note: string;
  created_at: string;
  updated_at: string;
  target_label: string;
  target_subtitle?: string;
  key_masked?: string;
  expires_at?: string | null;
  lifetime_limit_usd: number;
  public_pay_url?: string;
}

export interface BillingBindingInput {
  target_kind: BillingTargetKind;
  target_id: string;
  enabled: boolean;
  plan_ids: string[];
  price_overrides: Record<string, number>;
  allow_public_pay: boolean;
  note: string;
  set_expires_at?: boolean;
  expires_at?: string | null;
}

export interface BillingOrder {
  id: string;
  order_no: string;
  tenant_id: string;
  binding_id: string;
  target_kind: BillingTargetKind;
  target_id: string;
  target_label: string;
  end_user_id: string;
  plan_id: string;
  plan_name: string;
  plan_kind: BillingPlanKind;
  plan_snapshot: BillingPlan;
  provider: string;
  pay_channel: BillingPayChannel;
  amount_cents: number;
  currency: string;
  status: BillingOrderStatus;
  provider_order_id?: string;
  provider_trade_no?: string;
  qrcode_url?: string;
  pay_url?: string;
  fulfillment_summary?: string;
  fulfillment_error?: string;
  source: string;
  created_by?: string;
  expires_at: string;
  paid_at?: string | null;
  fulfilled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingOrderSummary {
  today_amount_cents: number;
  month_amount_cents: number;
  total_amount_cents: number;
  paid_count: number;
  pending_count: number;
  failed_count: number;
}

export interface BillingOrderListResult {
  items: BillingOrder[];
  total: number;
  page: number;
  size: number;
  summary: BillingOrderSummary;
}

export interface BillingCreateOrderInput {
  binding_id?: string;
  plan_id: string;
  pay_channel: "wechat" | "alipay";
  custom_amount_cents?: number;
}

export type BillingManualExtendMode = "extend_current" | "from_paid_at" | "record_only";

export interface BillingManualOrderInput {
  target_kind: BillingTargetKind;
  target_id: string;
  plan_id: string;
  amount_cents?: number;
  custom_amount_cents?: number;
  note?: string;
  paid_at?: string;
  duration_days?: number;
  extend_mode?: BillingManualExtendMode;
}

export interface BillingAdjustEntitlementInput {
  target_kind: BillingTargetKind;
  target_id: string;
  mode: "set" | "add_days";
  delta_days?: number;
  expires_at?: string | null;
}

export interface BillingEntitlementView {
  target_kind: BillingTargetKind;
  target_id: string;
  expires_at?: string | null;
}

export interface PortalBillingPlan {
  id: string;
  name: string;
  description: string;
  kind: BillingPlanKind;
  price_cents: number;
  duration_days: number;
  quota_amount_usd: number;
  quota_requests: number;
  quota_tokens: number;
  rate_usd_per_cny: number;
  min_amount_cents: number;
  max_amount_cents: number;
  permission_profile_id?: string;
  badge?: string;
}

export interface PortalBillingTarget {
  binding_id: string;
  target_kind: BillingTargetKind;
  target_id: string;
  label: string;
  key_masked?: string;
  expires_at?: string | null;
  lifetime_limit_usd: number;
  lifetime_used_usd: number;
  note?: string;
  plans: PortalBillingPlan[];
}

export interface PortalBillingOverview {
  enabled: boolean;
  currency: string;
  channels: Array<"wechat" | "alipay">;
  targets: PortalBillingTarget[];
}

export interface PublicBillingPayInfo {
  code: string;
  currency: string;
  channels: Array<"wechat" | "alipay">;
  target: PortalBillingTarget;
}

export interface APIKeyBillingOverview {
  enabled: boolean;
  has_billing_info: boolean;
  currency: string;
  channels: Array<"wechat" | "alipay">;
  target: PortalBillingTarget;
  orders_count: number;
}

export const formatCnyCents = (cents: number): string => `¥${(cents / 100).toFixed(2)}`;

export const billingAdminApi = {
  getSettings: () => apiClient.get<BillingSettings>("/billing/settings"),
  updateSettings: (body: BillingSettingsUpdate) =>
    apiClient.put<BillingSettings>("/billing/settings", body),
  testChannel: (body: BillingTestChannelRequest) =>
    apiClient.post<BillingTestChannelResult>("/billing/settings/test", body),
  listPlans: async (): Promise<BillingPlan[]> => {
    const res = await apiClient.get<{ items?: BillingPlan[] }>("/billing/plans");
    return res.items ?? [];
  },
  createPlan: (body: BillingPlanInput) => apiClient.post<BillingPlan>("/billing/plans", body),
  updatePlan: (id: string, body: BillingPlanInput) =>
    apiClient.patch<BillingPlan>(`/billing/plans/${encodeURIComponent(id)}`, body),
  deletePlan: (id: string) => apiClient.delete(`/billing/plans/${encodeURIComponent(id)}`),
  listBindings: async (): Promise<BillingBinding[]> => {
    const res = await apiClient.get<{ items?: BillingBinding[] }>("/billing/bindings");
    return res.items ?? [];
  },
  upsertBinding: (body: BillingBindingInput) =>
    apiClient.put<BillingBinding>("/billing/bindings", body),
  rotateBindingCode: (id: string) =>
    apiClient.post<BillingBinding>(`/billing/bindings/${encodeURIComponent(id)}/rotate-code`, {}),
  deleteBinding: (id: string) => apiClient.delete(`/billing/bindings/${encodeURIComponent(id)}`),
  adjustEntitlement: (body: BillingAdjustEntitlementInput) =>
    apiClient.patch<BillingEntitlementView>("/billing/entitlements", body),
  listOrders: (params?: {
    status?: string;
    search?: string;
    target_kind?: BillingTargetKind;
    target_id?: string;
    page?: number;
    size?: number;
  }) =>
    apiClient.get<BillingOrderListResult>("/billing/orders", {
      params: {
        ...(params?.status && params.status !== "all" ? { status: params.status } : {}),
        ...(params?.search ? { search: params.search } : {}),
        ...(params?.target_kind ? { target_kind: params.target_kind } : {}),
        ...(params?.target_id ? { target_id: params.target_id } : {}),
        page: params?.page ?? 1,
        size: params?.size ?? 20,
      },
    }),
  syncOrder: (orderNo: string) =>
    apiClient.post<BillingOrder>(`/billing/orders/${encodeURIComponent(orderNo)}/sync`, {}),
  fulfillOrder: (orderNo: string) =>
    apiClient.post<BillingOrder>(`/billing/orders/${encodeURIComponent(orderNo)}/fulfill`, {}),
  createManualOrder: (body: BillingManualOrderInput) =>
    apiClient.post<BillingOrder>("/billing/orders/manual", body),
};

export const portalBillingApi = {
  overview: () => portalClient.get<PortalBillingOverview>("/v0/portal/billing/overview"),
  createOrder: (body: BillingCreateOrderInput) =>
    portalClient.post<BillingOrder>("/v0/portal/billing/orders", body),
  listOrders: (params?: { page?: number; size?: number; status?: string }) => {
    const query = new URLSearchParams();
    query.set("page", String(params?.page ?? 1));
    query.set("size", String(params?.size ?? 20));
    if (params?.status && params.status !== "all") query.set("status", params.status);
    return portalClient.get<BillingOrderListResult>(`/v0/portal/billing/orders?${query.toString()}`);
  },
  getOrder: (orderNo: string, sync = false) =>
    portalClient.get<BillingOrder>(
      `/v0/portal/billing/orders/${encodeURIComponent(orderNo)}${sync ? "?sync=1" : ""}`,
    ),
};

export const publicBillingApi = {
  getPayInfo: (code: string) =>
    publicApiClient.get<PublicBillingPayInfo>(`/billing/pay/${encodeURIComponent(code)}`),
  createOrder: (code: string, body: BillingCreateOrderInput) =>
    publicApiClient.post<BillingOrder>(`/billing/pay/${encodeURIComponent(code)}/orders`, body),
  getOrder: (code: string, orderNo: string, sync = false) =>
    publicApiClient.get<BillingOrder>(
      `/billing/pay/${encodeURIComponent(code)}/orders/${encodeURIComponent(orderNo)}${sync ? "?sync=1" : ""}`,
    ),
};

export const apiKeyBillingApi = {
  overview: (apiKey: string) =>
    publicApiClient.post<APIKeyBillingOverview>("/billing/key/overview", { api_key: apiKey }),
  createOrder: (
    apiKey: string,
    body: { plan_id: string; pay_channel: "wechat" | "alipay"; custom_amount_cents?: number },
  ) =>
    publicApiClient.post<BillingOrder>("/billing/key/orders", {
      api_key: apiKey,
      ...body,
    }),
  listOrders: (apiKey: string, params?: { page?: number; size?: number }) =>
    publicApiClient.post<BillingOrderListResult>("/billing/key/orders/list", {
      api_key: apiKey,
      page: params?.page ?? 1,
      size: params?.size ?? 30,
    }),
  getOrder: (apiKey: string, orderNo: string, sync = false) =>
    publicApiClient.post<BillingOrder>("/billing/key/orders/status", {
      api_key: apiKey,
      order_no: orderNo,
      sync,
    }),
};
