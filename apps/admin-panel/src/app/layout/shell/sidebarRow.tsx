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
    <span className="grid h-8 w-[36px] shrink-0 place-items-center">
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
 * 收起时在前 100ms 干脆清场，避免宽度收缩时文字或箭头被右边缘硬切；
 * 展开时等侧栏宽度拉开过半（延迟 120ms）再柔和浮现。
 */
export const sidebarFadeClass = (collapsed: boolean) =>
  [
    "transition-opacity ease-sn-out motion-reduce:transition-none",
    collapsed ? "pointer-events-none opacity-0 duration-100" : "opacity-100 delay-120 duration-160",
  ].join(" ");

/**
 * 行内文字。收起时归零右侧内边距并直接裁切（不出「…」），彻底消除对图标槽的挤压；
 * 展开态由 trailingSpace 给右侧绝对定位箭头预留安全空间。
 */
export function SidebarRowLabel({
  collapsed,
  trailingSpace = false,
  children,
}: {
  collapsed: boolean;
  trailingSpace?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "min-w-0 flex-1",
        collapsed ? "overflow-hidden pr-0" : trailingSpace ? "truncate pr-7" : "truncate pr-2.5",
        sidebarFadeClass(collapsed),
      ].join(" ")}
    >
      {children}
    </span>
  );
}
