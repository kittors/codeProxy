import { apiClient } from "../client/client";

/**
 * 隐私脱敏：请求发往上游前把密钥、个人信息、脱敏词换成占位符，回复里再换回来（CliRelay
 * internal/privacymask）。这里是观测页和设置页用的接口。
 *
 * 记录里从不出现原值：每个值只有类型、是谁找到的、开头几个字符和长度；「上游看到的」片段里是
 * 占位符。只有后端在 GET /config 声明 `privacy-masking` 时才请求这些接口。
 */

/** 谁找到的：内置规则、用户自己的规则、脱敏词、之前遮过的值（同一个值再出现）。 */
export type MaskFinder = "rule" | "yours" | "word" | "known";
/** 对一个值做了什么："" 换成占位符；warn 原样发出并记录；block 整个请求拦下。 */
export type MaskAction = "" | "warn" | "block";

/** 一个请求里的一个值。 */
export interface MaskValueHit {
  kind: string;
  by: MaskFinder;
  action?: MaskAction;
  /** 开头几个字符：一般是首字符，密钥是它的前缀（sk-、ghp_）。 */
  head?: string;
  /** 长度（字符数）。 */
  len: number;
  /** 这个请求里有几处。 */
  n: number;
  /** 回复里换回了几处；回复还没结束、或拦下没发时缺省。 */
  restored?: number;
  /** 在请求里的位置，如 messages[3].content。 */
  field?: string;
  /** 上游看到的占位符，只在单条记录的详情里给。 */
  placeholder?: string;
}

/** 一个被脱敏的请求。 */
export interface MaskRecord {
  key: string;
  at: string;
  /** 客户端，按 User-Agent 归类：codex、claude-code、gemini-cli、opencode、cursor…，认不出是 other。 */
  client: string;
  api_key_id?: string;
  api_key_name?: string;
  end_user_id?: string;
  end_user_name?: string;
  /** 发往的渠道；拦下没发时为空。 */
  channel?: string;
  /** 渠道的厂商，给图标用。 */
  provider?: string;
  model?: string;
  /** 被替换的处数与不同值的个数。 */
  places: number;
  distinct: number;
  restored?: number;
  blocked?: boolean;
  warned?: number;
  took_us?: number;
  values: MaskValueHit[];
}

/** 上游看到的一段原文：值的前后各约 120 字，值是占位符。 */
export interface MaskSnippet {
  field: string;
  role?: string;
  text: string;
}

export interface MaskRecordDetail extends MaskRecord {
  /** 超过正文保留期后为空：记录还在，片段已清。 */
  snippets?: MaskSnippet[];
}

export interface MaskRecordPage {
  items: MaskRecord[];
  /** 下一页的游标，没有更多时缺省。 */
  next?: string;
}

export interface MaskDay {
  day: string;
  places: number;
  requests: number;
}

export interface MaskCount {
  name: string;
  places: number;
  requests: number;
  /** 渠道的厂商、客户端的出品方，给图标用。 */
  vendor?: string;
}

/** 按值统计：同一个值跨请求是同一个 id，不含原值。 */
export interface MaskTopValue {
  id: string;
  kind: string;
  by: MaskFinder;
  head?: string;
  len: number;
  places: number;
  requests: number;
  last_at: string;
}

export interface MaskSummary {
  days: MaskDay[];
  places: number;
  distinct: number;
  requests: number;
  blocked: number;
  warned: number;
  kinds: Array<{ kind: string; places: number; distinct: number }>;
  clients: MaskCount[];
  channels: MaskCount[];
  values: MaskTopValue[];
}

export interface MaskQuery {
  days: 7 | 30;
  kind?: string;
  /** secret、personal、word、rule：类目；warn、block：处理方式。 */
  facet?: string;
  client?: string;
  channel?: string;
  api_key_id?: string;
  end_user_id?: string;
  model?: string;
}

/** 用户自己的规则：前缀或 RE2 正则，二选一。 */
export interface MaskRule {
  kind: string;
  prefix?: string;
  regex?: string;
}

export type MaskKindAction = "mask" | "warn" | "block";

export interface PrivacyMaskPolicy {
  /** 脱敏密钥：API Key、私钥、令牌和密码。 */
  secrets: boolean;
  /** 脱敏个人信息：邮箱、手机号、身份证和银行卡号，另有各类别的开关。 */
  personal: boolean;
  /** 个人信息各类别的开关，只记用户改过的；没记的按类别默认值。 */
  kinds: Record<string, boolean>;
  words: string[];
  words_any_case: boolean;
  words_whole: boolean;
  rules: MaskRule[];
  allow: string[];
  /** 每个类型的处理方式，只记不是 mask 的。 */
  actions: Record<string, MaskKindAction>;
}

export interface PrivacyMaskSettings {
  /** 租户的脱敏设置，由管理员决定；门户用户只能看，不能改。 */
  policy: PrivacyMaskPolicy;
  /** 设置能不能保存（没接数据库时为 false）。 */
  persistent: boolean;
  /** 占位符密钥是否加密存库（服务器配了主密钥）。 */
  key_protected?: boolean;
  /** 运维在服务器上关掉了所有租户的脱敏（CLIRELAY_PRIVACY_MASK=off）：这里怎么设都不生效。 */
  server_disabled?: boolean;
  updated_at?: string;
}

export interface PrivacyMaskPreview {
  /** 上游会收到的文本，值换成了占位符。 */
  text: string;
  values: MaskValueHit[];
  /** 有类型设为拦截：这个请求会被拦下，什么都不发。 */
  blocked: boolean;
}

const queryString = (query: Partial<MaskQuery> & { before?: string; limit?: number }) => {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  }
  const text = qs.toString();
  return text ? `?${text}` : "";
};

export const privacyMaskingApi = {
  getSummary: (query: MaskQuery) =>
    apiClient.get<MaskSummary>(`/privacy-masking/summary${queryString(query)}`),
  listRecords: (query: MaskQuery, page: { before?: string; limit?: number } = {}) =>
    apiClient.get<MaskRecordPage>(`/privacy-masking/records${queryString({ ...query, ...page })}`),
  getRecord: (key: string) =>
    apiClient.get<MaskRecordDetail>(`/privacy-masking/records/${encodeURIComponent(key)}`),
  clearRecords: () => apiClient.delete<{ deleted: number }>("/privacy-masking/records"),
  getSettings: () => apiClient.get<PrivacyMaskSettings>("/privacy-masking/settings"),
  putSettings: (settings: Omit<PrivacyMaskSettings, "persistent" | "key_protected" | "server_disabled" | "updated_at">) =>
    apiClient.put<PrivacyMaskSettings>("/privacy-masking/settings", settings),
  preview: (text: string, policy?: PrivacyMaskPolicy) =>
    apiClient.post<PrivacyMaskPreview>("/privacy-masking/preview", { text, policy }),
};
