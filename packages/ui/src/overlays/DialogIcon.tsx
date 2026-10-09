import type { ReactNode } from "react";
import { HUE_TILE, hueForIcon, isHue, type Hue } from "../theme/hues";

/** 语义色调：只表达「这件事的性质」。 */
export type DialogSemanticTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * 图标块的色调：
 * - `auto`（默认）按图标自动取色相（见 theme/hues 的注册表），同一个图标在哪儿都是同一种颜色；
 *   厂商 logo 这类不是 lucide 图标的内容保持中性底，logo 自带品牌色；
 * - 色相名（`violet`、`teal`……）显式指定；
 * - 语义色调：红色只给不可恢复的删除 / 清空，琥珀是需要留意的变更，绿色是完成，蓝色是说明，
 *   中性用于确实不该带颜色的地方。
 *
 * 色相只在「外观 → 图标着色」为多彩时生效（HUE_TILE 是 icon-hue: 变体类）；单色时 auto 与
 * 色相名都落到中性淡底，语义色调仍保留颜色，只是从渐变变成一层平涂的淡底。
 */
export type DialogTone = DialogSemanticTone | Hue | "auto";

/**
 * 基础形态只有一层淡底，不描边：深色下用白色叠层而不是灰色实色，落在卡片、弹窗、浮层上
 * 都只比底色亮一档。多彩时在上面叠同色系渐变（HUE_TILE）。
 */
const SEMANTIC_CLASS: Record<DialogSemanticTone, string> = {
  neutral: "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
  info: `bg-sky-500/10 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300 ${HUE_TILE.sky}`,
  success: `bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300 ${HUE_TILE.emerald}`,
  warning: `bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300 ${HUE_TILE.amber}`,
  danger: `bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300 ${HUE_TILE.rose}`,
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

export function dialogToneClass(tone: DialogTone, icon?: ReactNode): string {
  if (isSemanticTone(tone)) return SEMANTIC_CLASS[tone];
  const hue = tone === "auto" ? hueForIcon(icon) : isHue(tone) ? tone : null;
  return hue ? `${SEMANTIC_CLASS.neutral} ${HUE_TILE[hue]}` : SEMANTIC_CLASS.neutral;
}

/**
 * 弹窗、分区、设置组、导航共用的图标块：圆角方块 + 淡底（多彩时是同色系渐变），一眼能看出
 * 「这是在处理什么」。图标尺寸由容器统一（不吃调用方传的 size），换个图标也不会忽大忽小。
 *
 * 放在卡片角落时传 `className="rounded-inner"`：圆角取「卡片圆角 − 内边距」，和卡片的
 * 圆角同一个圆心（见 Card 的说明）。
 */
export function DialogIcon({
  children,
  tone = "auto",
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
      className={["grid shrink-0 place-items-center", SIZE_CLASS[size], dialogToneClass(tone, children), className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
