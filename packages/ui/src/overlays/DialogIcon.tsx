import type { ReactNode } from "react";

export type DialogTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * 色调只表达「这件事的性质」：中性是日常操作，红色只给不可恢复的删除 / 清空，
 * 琥珀是需要留意的变更，绿色是完成，蓝色是说明。底色都是同色系的淡底，图标保持清晰。
 */
const TONE_CLASS: Record<DialogTone, string> = {
  neutral: "border-line bg-surface text-ink-2 shadow-xs dark:shadow-none",
  info: "border-sky-500/15 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  success: "border-emerald-500/15 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  danger: "border-rose-500/15 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

// 只统一 lucide 图标的尺寸（它们的 width/height 写在属性上，再由全局 zoom 跟随根字号缩放）；
// 厂商 logo 之类的自带 svg 尺寸由调用方决定。
const SIZE_CLASS = {
  sm: "h-8 w-8 rounded-lg [&_svg.lucide]:size-[16px]",
  md: "h-10 w-10 rounded-xl [&_svg.lucide]:size-[20px]",
  lg: "h-12 w-12 rounded-2xl [&_svg.lucide]:size-[24px]",
} as const;

/**
 * 弹窗、分区、设置组共用的图标块：和「添加 AI 账号」里提供商的图标块同一种形状——
 * 圆角方块、细描边、轻投影，一眼能看出「这是在处理什么」。
 * 图标尺寸由容器统一（不吃调用方传的 size），换个图标也不会忽大忽小。
 */
export function DialogIcon({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: DialogTone;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "grid shrink-0 place-items-center border",
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
