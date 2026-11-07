import { portalClient } from "../client/portal-client";
import type {
  MaskQuery,
  MaskRecordDetail,
  MaskRecordPage,
  MaskSummary,
  PrivacyMaskPolicy,
  PrivacyMaskPreview,
} from "./privacy-masking";

/**
 * 门户的隐私脱敏（/v0/portal/privacy-masking），只读：要不要脱敏、遮什么全由租户管理员决定，门户
 * 只让门户用户知道脱敏怎么做、自己名下请求遮了什么。只有 /v0/portal/auth/me 的 capabilities 声明
 * `privacy-masking` 时才请求这些接口（portalApi.me() 的 privacyMasking）；旧后端没有它们。
 *
 * 和控制台的接口（privacy-masking.ts）分开：两边的设置形状不同，控制台那份会随管理端继续演进。
 */

/**
 * 门户看到的设置：租户的设置。`policy` 里的 words、rules、allow 恒为空数组——租户的脱敏词、自定义
 * 规则和「从不脱敏」照样作用于这个用户的请求，只是不给门户看，免得用试一试把没公开的词试出来。
 */
export interface PortalPrivacyMaskSettings {
  policy: PrivacyMaskPolicy;
  /** 运维在服务器上关掉了所有租户的脱敏：请求不经脱敏直接发往上游，这里的规则暂不生效。 */
  server_disabled?: boolean;
  updated_at?: string;
}

const PATH = "/v0/portal/privacy-masking";

const queryString = (query: Partial<MaskQuery> & { before?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : "";
};

/** 记录只有本人名下 API Key 的请求：服务器按会话定范围，不认 end_user_id、api_key_id。 */
export const privacyMaskingPortalApi = {
  getSummary: (query: MaskQuery) =>
    portalClient.get<MaskSummary>(`${PATH}/summary${queryString(query)}`),
  listRecords: (query: MaskQuery, page: { before?: string; limit?: number } = {}) =>
    portalClient.get<MaskRecordPage>(`${PATH}/records${queryString({ ...query, ...page })}`),
  getRecord: (key: string) =>
    portalClient.get<MaskRecordDetail>(`${PATH}/records/${encodeURIComponent(key)}`),
  getSettings: () => portalClient.get<PortalPrivacyMaskSettings>(`${PATH}/settings`),
  /** 试一试：按租户的设置处理一段文字，同样不含租户的脱敏词、规则和「从不脱敏」；什么都不保存。 */
  preview: (text: string) => portalClient.post<PrivacyMaskPreview>(`${PATH}/preview`, { text }),
};
