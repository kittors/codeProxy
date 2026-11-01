import type {
  AlertChannel,
  AlertChannelKind,
  AlertLanguage,
  AlertRuleKey,
  AlertSettings,
  AlertSettingsUpdate,
} from "@code-proxy/api-client";

/** 后端没给 limits 时的上限（和契约里的默认一致）。 */
export const FALLBACK_MAX_CHANNELS = 8;

export const ALERT_RULE_KEYS: AlertRuleKey[] = [
  "quota_window",
  "account_failure",
  "spending",
  "use_it_or_lose_it",
];

/** 各数值字段的取值范围，和后端校验一致；超出的在页面上就地标红，不用等保存时被后端退回。 */
export const ALERT_LIMITS = {
  cooldown_minutes: { min: 10, max: 10080 },
  threshold_percent: { min: 1, max: 100 },
  for_minutes: { min: 0, max: 1440 },
  min_remaining_percent: { min: 1, max: 100 },
  hours_before_reset: { min: 1, max: 168 },
} as const;

/**
 * 一个密钥类字段（地址、签名密钥、Bot Token）的草稿。
 *
 * 读回来的是打码串（`masked`，空串表示没设置），打码串永远不进输入框：输入框留空 = 保持不变，
 * 输入 = 换成新值，`clear` = 保存时清除。提交时再按后端的约定翻译成：原样提交打码串 = 保留，
 * 空串 = 清除，其它 = 新值。
 */
export interface SecretDraft {
  masked: string;
  input: string;
  clear: boolean;
}

export const secretFrom = (masked: string | undefined): SecretDraft => ({
  masked: masked ?? "",
  input: "",
  clear: false,
});

/** 提交给后端的值。 */
export const secretWire = (secret: SecretDraft): string => {
  if (secret.clear) return "";
  const typed = secret.input.trim();
  return typed !== "" ? typed : secret.masked;
};

/** 保存后这个字段是有值的（输入了新值，或者原来就有且没被清除）。 */
export const secretIsSet = (secret: SecretDraft): boolean => secretWire(secret) !== "";

export interface ChannelDraft {
  /** 前端自己的稳定 key：新增的通道还没有 id，列表项和测试结果都要认得它。 */
  key: string;
  /** 已保存通道的 id；新增的没有，后端保存时生成。 */
  id?: string;
  kind: AlertChannelKind;
  name: string;
  enabled: boolean;
  url: SecretDraft;
  secret: SecretDraft;
  botToken: SecretDraft;
  chatId: string;
}

/** 数值输入框保持字符串：用户清空、输到一半时不能被强行改成 0 或 NaN。 */
export interface AlertDraft {
  enabled: boolean;
  language: AlertLanguage;
  cooldown: string;
  channels: ChannelDraft[];
  rules: {
    quota_window: { enabled: boolean; threshold: string };
    account_failure: { enabled: boolean; forMinutes: string };
    spending: { enabled: boolean; threshold: string };
    use_it_or_lose_it: { enabled: boolean; minRemaining: string; hoursBeforeReset: string };
  };
}

let channelKeySeq = 0;
export const nextChannelKey = () => `channel-${(channelKeySeq += 1)}`;

export function newChannelDraft(kind: AlertChannelKind = "webhook"): ChannelDraft {
  return {
    key: nextChannelKey(),
    kind,
    name: "",
    enabled: true,
    url: secretFrom(undefined),
    secret: secretFrom(undefined),
    botToken: secretFrom(undefined),
    chatId: "",
  };
}

const isKind = (value: unknown): value is AlertChannelKind =>
  value === "webhook" || value === "feishu" || value === "telegram";

function channelDraftFrom(channel: AlertChannel): ChannelDraft {
  return {
    key: nextChannelKey(),
    id: channel.id,
    kind: isKind(channel.kind) ? channel.kind : "webhook",
    name: channel.name ?? "",
    enabled: channel.enabled !== false,
    url: secretFrom(channel.url),
    secret: secretFrom(channel.secret),
    botToken: secretFrom(channel.bot_token),
    chatId: channel.chat_id ?? "",
  };
}

/** 消息语言默认跟随界面语言：简体中文用中文，其它一律英文（告警只提供这两种）。 */
export const alertLanguageForUi = (uiLanguage: string): AlertLanguage =>
  /^zh/i.test(uiLanguage) ? "zh-CN" : "en";

const alertLanguage = (value: unknown): AlertLanguage => (value === "zh-CN" ? "zh-CN" : "en");

const text = (value: unknown, fallback: number): string =>
  typeof value === "number" && Number.isFinite(value) ? String(value) : String(fallback);

/**
 * 把后端的设置翻译成表单草稿。字段缺失时按契约的默认值补，免得后端以后加了字段、
 * 面板读到 undefined 直接渲染成 NaN。
 *
 * 从没保存过的设置（没有 updated_at）里语言只是后端的默认值 en，这时改取界面语言作为起点：
 * 起点和草稿一致所以不算「有改动」，第一次保存会把它一起写下去（见 buildUpdate）。
 */
export function draftFromSettings(settings: AlertSettings, uiLanguage: string): AlertDraft {
  const rules = settings.rules;
  return {
    enabled: settings.enabled === true,
    language: settings.updated_at
      ? alertLanguage(settings.language)
      : alertLanguageForUi(uiLanguage),
    cooldown: text(settings.cooldown_minutes, 360),
    channels: (settings.channels ?? []).map(channelDraftFrom),
    rules: {
      quota_window: {
        enabled: rules?.quota_window?.enabled ?? true,
        threshold: text(rules?.quota_window?.threshold_percent, 90),
      },
      account_failure: {
        enabled: rules?.account_failure?.enabled ?? true,
        forMinutes: text(rules?.account_failure?.for_minutes, 10),
      },
      spending: {
        enabled: rules?.spending?.enabled ?? true,
        threshold: text(rules?.spending?.threshold_percent, 90),
      },
      use_it_or_lose_it: {
        enabled: rules?.use_it_or_lose_it?.enabled ?? false,
        minRemaining: text(rules?.use_it_or_lose_it?.min_remaining_percent, 40),
        hoursBeforeReset: text(rules?.use_it_or_lose_it?.hours_before_reset, 24),
      },
    },
  };
}

/** 通道在线上的样子。测试发送带的草稿、保存时的 channels、改没改过的判断，都用这一份。 */
export function channelToWire(channel: ChannelDraft): AlertChannel {
  const base = {
    ...(channel.id ? { id: channel.id } : {}),
    kind: channel.kind,
    name: channel.name.trim(),
    enabled: channel.enabled,
  };
  if (channel.kind === "telegram") {
    return { ...base, bot_token: secretWire(channel.botToken), chat_id: channel.chatId.trim() };
  }
  return { ...base, url: secretWire(channel.url), secret: secretWire(channel.secret) };
}

/** 通道有了发送目标（保存后能发出去）：地址，或者 Telegram 的 Bot Token 加 Chat ID。 */
export const channelHasDestination = (channel: ChannelDraft): boolean =>
  channel.kind === "telegram"
    ? secretIsSet(channel.botToken) && channel.chatId.trim() !== ""
    : secretIsSet(channel.url);

/** 整数，且在范围内；不是返回 null。空串、小数、带单位的写法都不算。 */
export function parseInteger(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed >= min && parsed <= max ? parsed : null;
}

/** 草稿里每个数值字段对应的字段路径（和后端 details.field 同一套写法）和范围。 */
const NUMERIC_FIELDS = (draft: AlertDraft) =>
  [
    ["cooldown_minutes", draft.cooldown, ALERT_LIMITS.cooldown_minutes],
    [
      "rules.quota_window.threshold_percent",
      draft.rules.quota_window.threshold,
      ALERT_LIMITS.threshold_percent,
    ],
    [
      "rules.account_failure.for_minutes",
      draft.rules.account_failure.forMinutes,
      ALERT_LIMITS.for_minutes,
    ],
    [
      "rules.spending.threshold_percent",
      draft.rules.spending.threshold,
      ALERT_LIMITS.threshold_percent,
    ],
    [
      "rules.use_it_or_lose_it.min_remaining_percent",
      draft.rules.use_it_or_lose_it.minRemaining,
      ALERT_LIMITS.min_remaining_percent,
    ],
    [
      "rules.use_it_or_lose_it.hours_before_reset",
      draft.rules.use_it_or_lose_it.hoursBeforeReset,
      ALERT_LIMITS.hours_before_reset,
    ],
  ] as const;

export interface RangeIssue {
  min: number;
  max: number;
}

/** 字段路径 → 取值范围：只列出不合法的字段。 */
export function validateDraft(draft: AlertDraft): Record<string, RangeIssue> {
  const issues: Record<string, RangeIssue> = {};
  for (const [path, value, range] of NUMERIC_FIELDS(draft)) {
    if (parseInteger(value, range.min, range.max) === null) {
      issues[path] = { min: range.min, max: range.max };
    }
  }
  return issues;
}

/** 草稿的规范化快照：判断有没有改动用，空白差异和打码串原样回传都不算改动。 */
function snapshot(draft: AlertDraft): string {
  return JSON.stringify({
    enabled: draft.enabled,
    language: draft.language,
    cooldown: draft.cooldown.trim(),
    channels: draft.channels.map(channelToWire),
    rules: {
      quota_window: {
        ...draft.rules.quota_window,
        threshold: draft.rules.quota_window.threshold.trim(),
      },
      account_failure: {
        ...draft.rules.account_failure,
        forMinutes: draft.rules.account_failure.forMinutes.trim(),
      },
      spending: { ...draft.rules.spending, threshold: draft.rules.spending.threshold.trim() },
      use_it_or_lose_it: {
        ...draft.rules.use_it_or_lose_it,
        minRemaining: draft.rules.use_it_or_lose_it.minRemaining.trim(),
        hoursBeforeReset: draft.rules.use_it_or_lose_it.hoursBeforeReset.trim(),
      },
    },
  });
}

export const isDirty = (baseline: AlertDraft, draft: AlertDraft): boolean =>
  snapshot(baseline) !== snapshot(draft);

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 只提交改过的部分。后端是部分更新（省略 = 不变），两个管理员同时改不同的分区时，
 * 后保存的一方不会把对方刚改的东西用旧值盖回去。通道和每条规则各自是一个整体：
 * 通道列表整体替换，一条规则改了就把它的所有字段一起提交。
 *
 * `firstSave`：设置从没保存过时，草稿里的语言是从界面语言推出来的、后端并不知道，
 * 无论有没有改动都要写下去，否则界面显示中文、后端实际发英文。
 */
export function buildUpdate(
  baseline: AlertDraft,
  draft: AlertDraft,
  options: { firstSave?: boolean } = {},
): AlertSettingsUpdate {
  const body: AlertSettingsUpdate = {};
  if (draft.enabled !== baseline.enabled) body.enabled = draft.enabled;
  if (options.firstSave || draft.language !== baseline.language) body.language = draft.language;
  if (draft.cooldown.trim() !== baseline.cooldown.trim()) {
    const cooldown = parseInteger(draft.cooldown, 0, Number.MAX_SAFE_INTEGER);
    if (cooldown !== null) body.cooldown_minutes = cooldown;
  }
  const channels = draft.channels.map(channelToWire);
  if (!sameJson(channels, baseline.channels.map(channelToWire))) body.channels = channels;

  const number = (value: string) => parseInteger(value, 0, Number.MAX_SAFE_INTEGER) ?? 0;
  const rules: NonNullable<AlertSettingsUpdate["rules"]> = {};
  const {
    quota_window: qw,
    account_failure: af,
    spending: sp,
    use_it_or_lose_it: ul,
  } = draft.rules;
  const base = baseline.rules;
  if (!sameJson(qw, base.quota_window)) {
    rules.quota_window = { enabled: qw.enabled, threshold_percent: number(qw.threshold) };
  }
  if (!sameJson(af, base.account_failure)) {
    rules.account_failure = { enabled: af.enabled, for_minutes: number(af.forMinutes) };
  }
  if (!sameJson(sp, base.spending)) {
    rules.spending = { enabled: sp.enabled, threshold_percent: number(sp.threshold) };
  }
  if (!sameJson(ul, base.use_it_or_lose_it)) {
    rules.use_it_or_lose_it = {
      enabled: ul.enabled,
      min_remaining_percent: number(ul.minRemaining),
      hours_before_reset: number(ul.hoursBeforeReset),
    };
  }
  if (Object.keys(rules).length > 0) body.rules = rules;
  return body;
}

/** 后端 `channels[2].url` 这样的字段路径里的通道序号。 */
export const channelIndexOfField = (field: string): number | null => {
  const match = /^channels\[(\d+)\]/.exec(field);
  return match ? Number(match[1]) : null;
};
