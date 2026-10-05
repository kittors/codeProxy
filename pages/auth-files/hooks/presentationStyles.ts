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
 * 订阅剩余天数：还早的订阅是常态，用中性灰；临近到期才变琥珀、红色——满屏绿色的
 * 「还剩 N 天」读不出任何需要处理的信息。
 */
export const SUBSCRIPTION_TONE_CLASSES = {
  active: "border-line bg-subtle text-ink-2",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
  urgent:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  expired:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
} as const;

export const RESTRICTION_TONE_CLASSES = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
  neutral:
    "border-slate-900/8 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.08] dark:text-white/70",
} as const;

export const CLAUDE_OAUTH_HEALTH_TONE_CLASSES = {
  danger:
    "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/15 dark:text-rose-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-200",
} as const;

export const STICKY_ACTIONS_HEADER_CLASS =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
// 冻结的操作列要不透明且和所在卡片同色（深色下卡片是 surface，不是页面底色）。
export const STICKY_ACTIONS_CELL_CLASS = "md:sticky md:z-30 md:bg-surface";
