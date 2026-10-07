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
 */
export type DialogTone = DialogSemanticTone | Hue | "auto";

const SEMANTIC_CLASS: Record<DialogSemanticTone, string> = {
  neutral: "border-line bg-surface text-ink-2 shadow-xs dark:shadow-none",
  info: HUE_TILE.sky,
  success: HUE_TILE.emerald,
  warning: HUE_TILE.amber,
  danger: HUE_TILE.rose,
};

// 只统一 lucide 图标的尺寸（它们的 width/height 写在属性上，再由全局 zoom 跟随根字号缩放）；
// 厂商 logo 之类的自带 svg 尺寸由调用方决定。
const SIZE_CLASS = {
  xs: "h-6 w-6 rounded-md [&_svg.lucide]:size-[13px]",
  sm: "h-8 w-8 rounded-lg [&_svg.lucide]:size-[16px]",
  md: "h-10 w-10 rounded-xl [&_svg.lucide]:size-[20px]",
  lg: "h-12 w-12 rounded-2xl [&_svg.lucide]:size-[24px]",
} as const;

export type DialogIconSize = keyof typeof SIZE_CLASS;

export function dialogToneClass(tone: DialogTone, icon: ReactNode): string {
  if (tone === "auto") {
    const hue = hueForIcon(icon);
    return hue ? HUE_TILE[hue] : SEMANTIC_CLASS.neutral;
  }
  if (isHue(tone)) return HUE_TILE[tone];
  return SEMANTIC_CLASS[tone];
}

/**
 * 弹窗、分区、设置组、导航共用的图标块：圆角方块、同色系渐变淡底、细描边，
 * 一眼能看出「这是在处理什么」。图标尺寸由容器统一（不吃调用方传的 size），换个图标也不会忽大忽小。
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
      className={[
        "grid shrink-0 place-items-center border",
        SIZE_CLASS[size],
        dialogToneClass(tone, children),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
