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

export const STICKY_ACTIONS_HEADER_CLASS =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
// 冻结的操作列要不透明且和表格所在的底同色：读 --cp-backdrop（内容区 / 卡片 / 弹窗各一档）。
export const STICKY_ACTIONS_CELL_CLASS = "md:sticky md:z-30 md:bg-backdrop";
