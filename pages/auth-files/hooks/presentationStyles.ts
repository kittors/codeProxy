import type { IdentityFingerprintFieldSource } from "@code-proxy/api-client";

export const KNOWN_QUOTA_TEXT_KEYS = new Set([
  "missing_auth_index",
  "no_model_quota",
  "request_failed",
  "missing_account_id",
  "parse_codex_failed",
  "parse_xai_failed",
  "empty_data",
  "missing_project_id",
  "parse_kiro_failed",
]);

/**
 * 卡片与列表里的状态标签：只有淡底、不描边（描边的小胶囊堆在一张卡上，读起来是一排框）。
 *
 * 订阅剩余天数：还早的订阅是常态，用中性灰；临近到期才变琥珀、红色——满屏绿色的
 * 「还剩 N 天」读不出任何需要处理的信息。
 */
const DANGER_TONE = "bg-rose-500/10 text-rose-800 dark:bg-rose-400/15 dark:text-rose-200";
const WARNING_TONE = "bg-amber-500/12 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200";
const NEUTRAL_TONE = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

export const SUBSCRIPTION_TONE_CLASSES = {
  active: NEUTRAL_TONE,
  warning: WARNING_TONE,
  urgent: DANGER_TONE,
  expired: DANGER_TONE,
} as const;

export const RESTRICTION_TONE_CLASSES = {
  danger: DANGER_TONE,
  warning: WARNING_TONE,
  neutral: NEUTRAL_TONE,
} as const;

export const CLAUDE_OAUTH_HEALTH_TONE_CLASSES = {
  danger: DANGER_TONE,
  warning: WARNING_TONE,
} as const;

/**
 * 身份指纹字段的来源标签：基础是中性标签（简约风格），文字已经写明是学习、预设还是内置；
 * 多彩风格下叠回来源色——学习绿、预设蓝，内置保持中性。
 */
const IDENTITY_SOURCE_TONE_CLASSES: Partial<Record<IdentityFingerprintFieldSource, string>> = {
  learned:
    "colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-200",
  preset:
    "colorful:bg-blue-50 colorful:text-blue-700 colorful:dark:bg-blue-500/15 colorful:dark:text-blue-200",
};

export const identitySourceBadgeClass = (source: IdentityFingerprintFieldSource): string =>
  `inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-semibold ${NEUTRAL_TONE} ${IDENTITY_SOURCE_TONE_CLASSES[source] ?? ""}`;

/** 身份档案列表里正在查看的那一项：强调色淡底，多彩风格下是蓝色淡底。 */
export const VIEWED_PROFILE_CLASS =
  "bg-accent-soft colorful:bg-blue-50 colorful:dark:bg-blue-500/10";

export const STICKY_ACTIONS_HEADER_CLASS =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
// 冻结的操作列要不透明且和表格所在的底同色：读 --cp-backdrop（内容区 / 卡片 / 弹窗各一档）。
export const STICKY_ACTIONS_CELL_CLASS = "md:sticky md:z-30 md:bg-backdrop";
