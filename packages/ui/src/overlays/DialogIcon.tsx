import type { ReactNode } from "react";
import type { Hue } from "../theme/hues";

/** 语义色调：只表达「这件事的性质」。 */
export type DialogSemanticTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * 图标块的色调。只有语义色调带颜色：红色只给不可恢复的删除 / 清空，琥珀是需要留意的变更，
 * 绿色是完成，蓝色是说明；其余一律中性。
 *
 * `auto` 与色相名（`violet`、`teal`……）是旧调用方式：以前按图标名自动取 14 种色相之一，
 * 一屏同时出现六七种颜色的图标块，读起来花、没有主次（外部评审原话「色太杂、强调色太多」）。
 * 现在它们都落到中性，保留类型只是为了不逼着每个调用点同步改写。
 */
export type DialogTone = DialogSemanticTone | Hue | "auto";

/**
 * 只有一层淡底，不描边、不渐变：图标块本身就是卡片里的又一层，再加描边和渐变就成了
 * 「框里套框」。深色下用白色叠层而不是灰色实色，落在卡片、弹窗、浮层上都只比底色亮一档。
 */
const SEMANTIC_CLASS: Record<DialogSemanticTone, string> = {
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  info: "bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  success: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  warning: "bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  danger: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
};

const isSemanticTone = (tone: DialogTone): tone is DialogSemanticTone =>
  tone === "neutral" || tone === "info" || tone === "success" || tone === "warning" || tone === "danger";

// 只统一 lucide 图标的尺寸（它们的 width/height 写在属性上，再由全局 zoom 跟随根字号缩放）；
// 厂商 logo 之类的自带 svg 尺寸由调用方决定。
const SIZE_CLASS = {
  xs: "h-6 w-6 rounded-md [&_svg.lucide]:size-[13px]",
  sm: "h-8 w-8 rounded-lg [&_svg.lucide]:size-[16px]",
  md: "h-10 w-10 rounded-xl [&_svg.lucide]:size-[20px]",
  lg: "h-12 w-12 rounded-2xl [&_svg.lucide]:size-[24px]",
} as const;

export type DialogIconSize = keyof typeof SIZE_CLASS;

export function dialogToneClass(tone: DialogTone, _icon?: ReactNode): string {
  return SEMANTIC_CLASS[isSemanticTone(tone) ? tone : "neutral"];
}

/**
 * 弹窗、分区、设置组、导航共用的图标块：圆角方块 + 一层淡底，一眼能看出「这是在处理什么」。
 * 图标尺寸由容器统一（不吃调用方传的 size），换个图标也不会忽大忽小。
 *
 * 放在卡片角落时传 `className="rounded-inner"`：圆角取「卡片圆角 − 内边距」，和卡片的
 * 圆角同一个圆心（见 Card 的说明）。
 */
export function DialogIcon({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: DialogTone;
  size?: DialogIconSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={["grid shrink-0 place-items-center", SIZE_CLASS[size], dialogToneClass(tone), className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
