import type { EndUser } from "@code-proxy/api-client/endpoints/end-users";
import {
  makePermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import {
  draftToRoutes,
  draftToRules,
  emptyMatrixDraft,
  parseMatrixDraft,
  policyToDraft,
  type AccessPolicyDraft,
} from "@features/access-policy";
import type { AccessScopeValue } from "@features/api-key-restrictions";

/** 权限模板表单的草稿：数字字段保留输入框里的原始文本，保存时再转换。 */
export type ProfileDraft = {
  id: string;
  name: string;
  policy: AccessPolicyDraft;
  access: AccessScopeValue;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  systemPrompt: string;
};

export const emptyDraft = (): ProfileDraft => ({
  id: "",
  name: "",
  policy: { limits: emptyMatrixDraft(), rules: [], routes: [] },
  access: { allowedModels: [], allowedChannels: [], allowedChannelGroups: [], useExactChannels: false },
  concurrencyLimit: "",
  rpmLimit: "",
  tpmLimit: "",
  systemPrompt: "",
});

const limitToText = (value: number | undefined) => (value && value > 0 ? String(value) : "");

const limitFromText = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const readDraft = (profile: ApiKeyPermissionProfile): ProfileDraft => ({
  id: profile.id,
  name: profile.name,
  policy: policyToDraft({
    limits: profile["quota-limits"],
    rules: profile["model-rules"],
    routes: profile["model-routes"],
  }),
  access: {
    allowedModels: [...profile["allowed-models"]],
    allowedChannels: [...profile["allowed-channels"]],
    allowedChannelGroups: [...profile["allowed-channel-groups"]],
    useExactChannels: profile["allowed-channels"].length > 0,
  },
  concurrencyLimit: limitToText(profile["concurrency-limit"]),
  rpmLimit: limitToText(profile["rpm-limit"]),
  tpmLimit: limitToText(profile["tpm-limit"]),
  systemPrompt: profile["system-prompt"],
});

/** 复制一个模板做变体：值全部带上，id 清空（保存时按名称生成新的），规则与路由换新 id。 */
export const duplicateDraft = (profile: ApiKeyPermissionProfile, name: string): ProfileDraft => {
  const draft = readDraft(profile);
  return {
    ...draft,
    id: "",
    name,
    policy: {
      ...draft.policy,
      rules: draft.policy.rules.map((rule) => ({ ...rule, id: "" })),
      routes: draft.policy.routes.map((route) => ({ ...route, id: "" })),
    },
  };
};

/**
 * 草稿转成模板。扁平的旧字段（每日请求、总请求、美元四周期）由序列化时从矩阵同步，
 * 这里只需要给出矩阵；累计消费不属于模板，始终为 0。
 */
export const draftToProfile = (draft: ProfileDraft): ApiKeyPermissionProfile => {
  const limits = parseMatrixDraft(draft.policy.limits).matrix;
  limits.cost.lifetime = 0;
  return {
    id: draft.id || makePermissionProfileId(draft.name),
    name: draft.name.trim(),
    "daily-limit": limits.requests.day,
    "total-quota": limits.requests.lifetime,
    "daily-spending-limit": limits.cost.day,
    "period-spending-limits": {
      "5h": limits.cost["5h"],
      day: limits.cost.day,
      week: limits.cost.week,
      month: limits.cost.month,
    },
    "concurrency-limit": limitFromText(draft.concurrencyLimit),
    "rpm-limit": limitFromText(draft.rpmLimit),
    "tpm-limit": limitFromText(draft.tpmLimit),
    "allowed-channel-groups": draft.access.allowedChannelGroups,
    "allowed-channels": draft.access.useExactChannels ? draft.access.allowedChannels : [],
    "allowed-models": draft.access.allowedModels,
    "system-prompt": draft.systemPrompt.trim(),
    "quota-limits": limits,
    "model-rules": draftToRules(draft.policy.rules),
    "model-routes": draftToRoutes(draft.policy.routes),
  };
};

export const boundProfileCount = (profile: ApiKeyPermissionProfile, accounts: EndUser[]) =>
  accounts.filter((account) => account["permission-profile-id"] === profile.id).length;
