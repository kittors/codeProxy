import type { EndUser } from "@code-proxy/api-client/endpoints/end-users";
import {
  makePermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import {
  emptyPeriodSpendingDraft,
  limitsToPeriodSpendingDraft,
  periodSpendingDraftToLimits,
  type PeriodSpendingDraft,
} from "@features/period-spending";

/** 权限模板表单的草稿：数字字段保留输入框里的原始文本，保存时再转换。 */
export type ProfileDraft = {
  id: string;
  name: string;
  dailyLimit: string;
  totalQuota: string;
  periodSpending: PeriodSpendingDraft;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
  systemPrompt: string;
};

export const emptyDraft = (): ProfileDraft => ({
  id: "",
  name: "",
  dailyLimit: "",
  totalQuota: "",
  periodSpending: emptyPeriodSpendingDraft(),
  concurrencyLimit: "",
  rpmLimit: "",
  tpmLimit: "",
  allowedModels: [],
  allowedChannels: [],
  allowedChannelGroups: [],
  useExactChannelRestrictions: false,
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
  dailyLimit: limitToText(profile["daily-limit"]),
  totalQuota: limitToText(profile["total-quota"]),
  periodSpending: limitsToPeriodSpendingDraft(profile["period-spending-limits"]),
  concurrencyLimit: limitToText(profile["concurrency-limit"]),
  rpmLimit: limitToText(profile["rpm-limit"]),
  tpmLimit: limitToText(profile["tpm-limit"]),
  allowedModels: [...profile["allowed-models"]],
  allowedChannels: [...profile["allowed-channels"]],
  allowedChannelGroups: [...profile["allowed-channel-groups"]],
  useExactChannelRestrictions: profile["allowed-channels"].length > 0,
  systemPrompt: profile["system-prompt"],
});

export const draftToProfile = (draft: ProfileDraft): ApiKeyPermissionProfile => ({
  id: draft.id || makePermissionProfileId(draft.name),
  name: draft.name.trim(),
  "daily-limit": limitFromText(draft.dailyLimit),
  "total-quota": limitFromText(draft.totalQuota),
  "daily-spending-limit": periodSpendingDraftToLimits(draft.periodSpending).day,
  "period-spending-limits": periodSpendingDraftToLimits(draft.periodSpending),
  "concurrency-limit": limitFromText(draft.concurrencyLimit),
  "rpm-limit": limitFromText(draft.rpmLimit),
  "tpm-limit": limitFromText(draft.tpmLimit),
  "allowed-channel-groups": draft.allowedChannelGroups,
  "allowed-channels": draft.useExactChannelRestrictions ? draft.allowedChannels : [],
  "allowed-models": draft.allowedModels,
  "system-prompt": draft.systemPrompt.trim(),
});

export const boundProfileCount = (profile: ApiKeyPermissionProfile, accounts: EndUser[]) =>
  accounts.filter((account) => account["permission-profile-id"] === profile.id).length;
