import type { ReactNode } from "react";

// 请求详情里的小标签：只用状态色的淡底，深浅色由同一组类名覆盖。
const BADGE_TONE = {
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  danger: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

export type DetailBadgeTone = keyof typeof BADGE_TONE;

export function DetailBadge({ tone, children }: { tone: DetailBadgeTone; children: ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONE[tone]}`}>
      {children}
    </span>
  );
}
