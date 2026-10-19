import {
  QUOTA_METRICS,
  QUOTA_WINDOWS,
  quotaMatrixEquals,
  quotaMatrixToPatch,
  type AccessPolicyCapabilities,
  type ApiKeyPermissionProfile,
  type EndUser,
  type EndUserUpdateBody,
  type ModelRoute,
  type ModelRule,
  type QuotaCellKey,
  type QuotaMatrix,
} from "@code-proxy/api-client";
import {
  draftToRoutes,
  draftToRules,
  parseMatrixDraft,
  policyToDraft,
  type AccessPolicyDraft,
} from "@features/access-policy";
import type { AccessScopeValue } from "@features/api-key-restrictions";

export type PolicySource = "template" | "custom";

/** 编辑账号的完整表单。数字字段保留输入框里的原文，保存时再解析。 */
export interface AccountEditForm {
  username: string;
  displayName: string;
  password: string;
  source: PolicySource;
  /** source 为 template 时选中的模板。 */
  permissionProfileId: string;
  policy: AccessPolicyDraft;
  access: AccessScopeValue;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  systemPrompt: string;
}

/** 模板管理的那部分（除资料与累计消费以外的全部）。 */
export type ManagedPolicy = Pick<
  AccountEditForm,
  "policy" | "access" | "concurrencyLimit" | "rpmLimit" | "tpmLimit" | "systemPrompt"
>;

/** 绑定模板后账号上唯一还能单独改的格子：累计消费是发给账号的额度，不是模板属性。 */
export const ACCOUNT_OWNED_CELLS: ReadonlySet<QuotaCellKey> = new Set(["cost.lifetime"]);

const countText = (value: number | undefined) => (value && value > 0 ? String(value) : "");

export const countFromText = (value: string): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const accessOf = (source: {
  "allowed-models"?: string[];
  "allowed-channels"?: string[];
  "allowed-channel-groups"?: string[];
}): AccessScopeValue => ({
  allowedModels: [...(source["allowed-models"] ?? [])],
  allowedChannels: [...(source["allowed-channels"] ?? [])],
  allowedChannelGroups: [...(source["allowed-channel-groups"] ?? [])],
  useExactChannels: (source["allowed-channels"] ?? []).length > 0,
});

/** 账号列表返回的是模板覆盖后的生效值，所以绑定模板的账号打开时看到的就是模板的值。 */
export const accountToForm = (user: EndUser): AccountEditForm => {
  const profileId = (user["permission-profile-id"] ?? "").trim();
  return {
    username: user.username,
    displayName: user.display_name,
    password: "",
    source: profileId ? "template" : "custom",
    permissionProfileId: profileId,
    policy: policyToDraft({
      limits: user["quota-limits"],
      rules: user["model-rules"],
      routes: user["model-routes"],
    }),
    access: accessOf(user),
    concurrencyLimit: countText(user["concurrency-limit"]),
    rpmLimit: countText(user["rpm-limit"]),
    tpmLimit: countText(user["tpm-limit"]),
    systemPrompt: user["system-prompt"] ?? "",
  };
};

export const pickManagedPolicy = (form: AccountEditForm): ManagedPolicy => ({
  policy: form.policy,
  access: form.access,
  concurrencyLimit: form.concurrencyLimit,
  rpmLimit: form.rpmLimit,
  tpmLimit: form.tpmLimit,
  systemPrompt: form.systemPrompt,
});

/** 模板的值铺进表单；累计消费那一格保留账号自己的值。 */
export const profileToManagedPolicy = (
  profile: ApiKeyPermissionProfile,
  lifetimeCost: string,
): ManagedPolicy => {
  const policy = policyToDraft({
    limits: profile["quota-limits"],
    rules: profile["model-rules"],
    routes: profile["model-routes"],
  });
  policy.limits.cost.lifetime = lifetimeCost;
  return {
    policy,
    access: accessOf(profile),
    concurrencyLimit: countText(profile["concurrency-limit"]),
    rpmLimit: countText(profile["rpm-limit"]),
    tpmLimit: countText(profile["tpm-limit"]),
    systemPrompt: profile["system-prompt"],
  };
};

const canonicalRules = (rules: readonly ModelRule[]) =>
  JSON.stringify(
    rules.map((rule) => [
      rule.id,
      rule.name ?? "",
      rule.models,
      QUOTA_METRICS.map((metric) => QUOTA_WINDOWS.map((window) => rule.limits[metric][window])),
      rule["fallback-model"] ?? "",
    ]),
  );

const canonicalRoutes = (routes: readonly ModelRoute[]) =>
  JSON.stringify(routes.map((route) => [route.id, route.from, route.to]));

const sameList = (a: readonly string[] | undefined, b: readonly string[]) =>
  JSON.stringify(a ?? []) === JSON.stringify(b);

/** 旧后端绑定模板时不会自己复制模板快照，沿用旧面板的做法把模板的值一并提交。 */
const legacyProfileFields = (profile: ApiKeyPermissionProfile): EndUserUpdateBody => ({
  "daily-limit": profile["daily-limit"],
  "total-quota": profile["total-quota"],
  "concurrency-limit": profile["concurrency-limit"],
  "rpm-limit": profile["rpm-limit"],
  "tpm-limit": profile["tpm-limit"],
  "allowed-models": [...profile["allowed-models"]],
  "allowed-channels": [...profile["allowed-channels"]],
  "allowed-channel-groups": [...profile["allowed-channel-groups"]],
  "system-prompt": profile["system-prompt"],
});

/** 旧后端只认识扁平字段：把矩阵里它能保存的格子按原字段名写出（只写有变化的）。 */
const legacyMatrixPatch = (next: QuotaMatrix, prev: QuotaMatrix): EndUserUpdateBody => {
  const body: EndUserUpdateBody = {};
  if (next.requests.day !== prev.requests.day) body["daily-limit"] = next.requests.day;
  if (next.requests.lifetime !== prev.requests.lifetime) body["total-quota"] = next.requests.lifetime;
  if (next.cost.lifetime !== prev.cost.lifetime) body["spending-limit"] = next.cost.lifetime;
  const periods = ["5h", "day", "week", "month"] as const;
  if (periods.some((period) => next.cost[period] !== prev.cost[period])) {
    body["daily-spending-limit"] = next.cost.day;
    body["period-spending-limits"] = {
      "5h": next.cost["5h"],
      day: next.cost.day,
      week: next.cost.week,
      month: next.cost.month,
    };
  }
  return body;
};

/**
 * 把表单翻译成 PATCH 请求体，只带有变化的字段。
 *
 * - 绑定模板：模板是权威，只提交模板 id 与账号自己的累计消费额度；
 * - 单独设置：提交改动过的额度、规则、路由、访问范围与速率。从模板解绑时后端会清掉模板
 *   带来的规则、路由与访问范围（旧面板看不到它们），所以解绑这一次把要保留的值全部显式带上。
 */
export const buildAccountUpdate = (
  user: EndUser,
  form: AccountEditForm,
  profiles: readonly ApiKeyPermissionProfile[],
  capabilities: AccessPolicyCapabilities,
): EndUserUpdateBody => {
  const body: EndUserUpdateBody = {};
  const username = form.username.trim();
  const displayName = form.displayName.trim();
  if (username && username !== user.username) body.username = username;
  if (displayName && displayName !== user.display_name) body.display_name = displayName;
  if (form.password.trim()) body.password = form.password;

  const prevProfile = (user["permission-profile-id"] ?? "").trim();
  const nextProfile = form.source === "template" ? form.permissionProfileId.trim() : "";
  if (nextProfile !== prevProfile) body["permission-profile-id"] = nextProfile;
  const next = parseMatrixDraft(form.policy.limits).matrix;
  const prev = user["quota-limits"];

  if (nextProfile) {
    if (next.cost.lifetime !== prev.cost.lifetime) {
      if (capabilities.accessPolicy) body["quota-limits"] = { cost: { lifetime: next.cost.lifetime } };
      else body["spending-limit"] = next.cost.lifetime;
    }
    const profile = profiles.find((item) => item.id === nextProfile);
    if (!capabilities.accessPolicy && profile && nextProfile !== prevProfile) {
      Object.assign(body, legacyProfileFields(profile));
    }
    return body;
  }

  const unbinding = prevProfile !== "";
  if (capabilities.accessPolicy) {
    if (unbinding || !quotaMatrixEquals(next, prev)) body["quota-limits"] = quotaMatrixToPatch(next);
    const rules = draftToRules(form.policy.rules);
    if (unbinding || canonicalRules(rules) !== canonicalRules(user["model-rules"])) body["model-rules"] = rules;
    const routes = draftToRoutes(form.policy.routes);
    if (unbinding || canonicalRoutes(routes) !== canonicalRoutes(user["model-routes"])) {
      body["model-routes"] = routes;
    }
    const channels = form.access.useExactChannels ? form.access.allowedChannels : [];
    if (unbinding || !sameList(user["allowed-models"], form.access.allowedModels)) {
      body["allowed-models"] = [...form.access.allowedModels];
    }
    if (unbinding || !sameList(user["allowed-channel-groups"], form.access.allowedChannelGroups)) {
      body["allowed-channel-groups"] = [...form.access.allowedChannelGroups];
    }
    if (unbinding || !sameList(user["allowed-channels"], channels)) body["allowed-channels"] = [...channels];
    const prompt = form.systemPrompt.trim();
    if (unbinding || prompt !== (user["system-prompt"] ?? "")) body["system-prompt"] = prompt;
  } else {
    Object.assign(body, legacyMatrixPatch(next, prev));
  }

  const rate = {
    "concurrency-limit": countFromText(form.concurrencyLimit),
    "rpm-limit": countFromText(form.rpmLimit),
    "tpm-limit": countFromText(form.tpmLimit),
  } as const;
  for (const field of Object.keys(rate) as Array<keyof typeof rate>) {
    if (unbinding || rate[field] !== (user[field] ?? 0)) body[field] = rate[field];
  }
  return body;
};
