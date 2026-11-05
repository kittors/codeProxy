import {
  portalPrivacyMaskingApi,
  privacyMaskingApi,
  type MaskQuery,
  type MaskRecordDetail,
  type MaskRecordPage,
  type MaskSummary,
  type PortalPrivacyMaskSettings,
  type PrivacyMaskPolicy,
  type PrivacyMaskPreview,
  type PrivacyMaskSettings,
} from "@code-proxy/api-client";

/** 页面读到的设置：控制台是租户的默认设置，门户是现在对这个用户生效的那份（另有 own、allowed）。 */
export type MaskingSettingsView = PrivacyMaskSettings &
  Partial<Pick<PortalPrivacyMaskSettings, "own" | "allowed">>;

/**
 * 脱敏页读的数据从哪来：控制台读租户的（/v0/management/privacy-masking），门户读门户用户自己
 * 名下的（/v0/portal/privacy-masking）。两边的记录接口一模一样。这里只有读：控制台保存设置仍由
 * 设置页直接调 privacyMaskingApi，门户只读，不写任何东西。
 *
 * 方法都包一层箭头，调用时才去找接口对象上的函数：单测按模块替换接口时照样生效。
 */
export interface MaskingSource {
  getSummary(query: MaskQuery): Promise<MaskSummary>;
  listRecords(
    query: MaskQuery,
    page?: { before?: string; limit?: number },
  ): Promise<MaskRecordPage>;
  getRecord(key: string): Promise<MaskRecordDetail>;
  getSettings(): Promise<MaskingSettingsView>;
  preview(text: string, policy?: PrivacyMaskPolicy): Promise<PrivacyMaskPreview>;
}

export const tenantMaskingSource: MaskingSource = {
  getSummary: (query) => privacyMaskingApi.getSummary(query),
  listRecords: (query, page) => privacyMaskingApi.listRecords(query, page),
  getRecord: (key) => privacyMaskingApi.getRecord(key),
  getSettings: () => privacyMaskingApi.getSettings(),
  preview: (text, policy) => privacyMaskingApi.preview(text, policy),
};

export const portalMaskingSource: MaskingSource = {
  getSummary: (query) => portalPrivacyMaskingApi.getSummary(query),
  listRecords: (query, page) => portalPrivacyMaskingApi.listRecords(query, page),
  getRecord: (key) => portalPrivacyMaskingApi.getRecord(key),
  getSettings: () => portalPrivacyMaskingApi.getSettings(),
  preview: (text, policy) => portalPrivacyMaskingApi.preview(text, policy),
};
