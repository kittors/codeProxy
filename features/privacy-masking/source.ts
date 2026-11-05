import {
  ApiError,
  extractApiErrorCode,
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

/** 设置页拿到的设置：控制台是租户的默认设置，门户另有 own 和 allowed。 */
export type MaskingSettingsView = PrivacyMaskSettings &
  Partial<Pick<PortalPrivacyMaskSettings, "own" | "allowed">>;

/**
 * 脱敏页的数据从哪来。控制台读写租户的（/v0/management/privacy-masking），门户读写门户用户自己的
 * （/v0/portal/privacy-masking）。两边的记录接口一模一样；设置的形状和能写的字段不同：控制台写
 * 默认设置、强制开启的类目和门户用户能否自设，门户只写自己的设置，还能删掉它回到管理员的默认。
 *
 * 方法都包一层箭头，调用时才去找 privacyMaskingApi 上的函数：单测按模块替换接口时照样生效。
 */
export interface MaskingSource {
  getSummary(query: MaskQuery): Promise<MaskSummary>;
  listRecords(
    query: MaskQuery,
    page?: { before?: string; limit?: number },
  ): Promise<MaskRecordPage>;
  getRecord(key: string): Promise<MaskRecordDetail>;
  preview(text: string, policy?: PrivacyMaskPolicy): Promise<PrivacyMaskPreview>;
  getSettings(): Promise<MaskingSettingsView>;
  saveSettings(next: MaskingSettingsView): Promise<MaskingSettingsView>;
  /** 门户：删掉自己的设置，回到管理员的默认设置。控制台没有。 */
  resetSettings?: () => Promise<MaskingSettingsView>;
}

export const tenantMaskingSource: MaskingSource = {
  getSummary: (query) => privacyMaskingApi.getSummary(query),
  listRecords: (query, page) => privacyMaskingApi.listRecords(query, page),
  getRecord: (key) => privacyMaskingApi.getRecord(key),
  preview: (text, policy) => privacyMaskingApi.preview(text, policy),
  getSettings: () => privacyMaskingApi.getSettings(),
  saveSettings: (next) =>
    privacyMaskingApi.putSettings({
      policy: next.policy,
      enforced: next.enforced,
      portal_default_allowed: next.portal_default_allowed,
    }),
};

export const portalMaskingSource: MaskingSource = {
  getSummary: (query) => portalPrivacyMaskingApi.getSummary(query),
  listRecords: (query, page) => portalPrivacyMaskingApi.listRecords(query, page),
  getRecord: (key) => portalPrivacyMaskingApi.getRecord(key),
  preview: (text, policy) => portalPrivacyMaskingApi.preview(text, policy),
  getSettings: () => portalPrivacyMaskingApi.getSettings(),
  saveSettings: (next) => portalPrivacyMaskingApi.putSettings(next.policy),
  resetSettings: () => portalPrivacyMaskingApi.resetSettings(),
};

/**
 * 页面打开期间管理员收回了门户用户自设的权限：写入答 403 privacy_masking_portal_forbidden。
 * 这时重新读一遍设置，改成只读，而不是留一个存不进去的表单。
 */
export const isPortalMaskingForbidden = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status === 403 &&
  extractApiErrorCode(error.payload) === "privacy_masking_portal_forbidden";
