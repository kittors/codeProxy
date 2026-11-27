import type { ReactNode } from "react";
import { type MenuIconComponent } from "@code-proxy/ui";
import { ACTIVE_ICON_STROKE } from "./navModel";

/**
 * 侧边栏图标遵循 Satin 官方工作台克制双色调范式：
 * 未激活态用中性三级墨色，激活态抬升至主墨色，彻底摒弃侧栏彩虹装饰染色。
 */
export const sidebarIconClass = (_icon: MenuIconComponent, active: boolean) =>
  active ? "text-[var(--sn-label)]" : "text-[var(--sn-label3)]";

/**
 * 侧边栏选中项基础样式（对齐 Satin `--sn-side-active` 与 `--sn-side-active-line`）：
 * 当导航区启用流体滑块 `.cp-side-hl` 时由滑块承载浮面卡片，保留 `bg-sn-raised` 类名以兼容既有单测语义。
 */
export const SIDEBAR_ACTIVE_CARD =
  "cp-side-active bg-sn-raised text-[var(--sn-label)] shadow-[0_0_0_1px_var(--sn-side-active-line,rgba(0,0,0,0.06)),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-[var(--sn-side-active)] dark:shadow-[inset_0_0_0_1px_var(--sn-side-active-line,rgba(255,255,255,0.07))]";

export const sidebarRowClass = (active: boolean) =>
  [
    "relative z-[1] flex h-8 w-full min-w-0 items-center rounded-lg text-left text-sm whitespace-nowrap outline-none",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--sn-ease-out)] active:scale-[0.985]",
    active
      ? `${SIDEBAR_ACTIVE_CARD} font-medium`
      : "text-[var(--sn-label2)] hover:bg-[var(--sn-fill-hover)] hover:text-[var(--sn-label)]",
  ].join(" ");

export function SidebarRowIcon({ icon: Icon, active }: { icon: MenuIconComponent; active: boolean }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center">
      <Icon
        size={17}
        strokeWidth={active ? ACTIVE_ICON_STROKE : undefined}
        className={sidebarIconClass(Icon, active)}
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * 收起时只剩图标格，格子以外的东西（文字、箭头、产品名）都用这一套淡入淡出：
 * 收起时立刻淡出（150ms）；展开时等宽度先让出一段再淡入（延迟 100ms），不会挤在半截里出现。
 */
export const sidebarFadeClass = (collapsed: boolean) =>
  [
    "transition-opacity ease-[var(--sn-ease-out)] motion-reduce:transition-none",
    collapsed ? "opacity-0 duration-150" : "opacity-100 delay-100 duration-200",
  ].join(" ");

/**
 * 行内文字。收起时改成直接裁切而不是省略号——否则宽度收缩的那几帧会闪出一串「…」。
 * 收起后文字仍留在 DOM 里，链接和按钮的可访问名称不受影响。
 */
export function SidebarRowLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={[
        "min-w-0 flex-1 pr-2.5",
        collapsed ? "overflow-hidden" : "truncate",
        sidebarFadeClass(collapsed),
      ].join(" ")}
    >
      {children}
    </span>
  );
}
