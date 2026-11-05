import {
  privacyMaskingApi,
  privacyMaskingPortalApi,
  type MaskQuery,
  type MaskRecordDetail,
  type MaskRecordPage,
  type MaskSummary,
} from "@code-proxy/api-client";

/**
 * 观测页的记录从哪来：控制台读租户的（/v0/management/privacy-masking），门户读门户用户自己名下的
 * （/v0/portal/privacy-masking）。两边的汇总、列表和详情一模一样；设置的形状不同，各自读。
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
}

export const tenantMaskingSource: MaskingSource = {
  getSummary: (query) => privacyMaskingApi.getSummary(query),
  listRecords: (query, page) => privacyMaskingApi.listRecords(query, page),
  getRecord: (key) => privacyMaskingApi.getRecord(key),
};

export const portalMaskingSource: MaskingSource = {
  getSummary: (query) => privacyMaskingPortalApi.getSummary(query),
  listRecords: (query, page) => privacyMaskingPortalApi.listRecords(query, page),
  getRecord: (key) => privacyMaskingPortalApi.getRecord(key),
};
