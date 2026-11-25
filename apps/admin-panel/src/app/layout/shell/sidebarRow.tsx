import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HUE_GLYPH, hueForIconName } from "@code-proxy/ui";
import { ACTIVE_ICON_STROKE } from "./navModel";

/**
 * 侧边栏图标的颜色，跟随「外观 → 图标着色」：
 * - 多彩：按全站的「图标 → 色相」注册表取（与页面里同一个图标的颜色一致），扫一眼就分得出
 *   哪个是哪个；文字保持中性色，选中态靠白色小卡片表达；
 * - 单色：平时是弱化的墨色，只有当前页的图标用强调色，一列图标里只有一个带颜色。
 */
export const sidebarIconClass = (icon: LucideIcon, active: boolean) =>
  [
    active ? "text-accent-ink" : "text-[var(--sn-label3)]",
    HUE_GLYPH[hueForIconName((icon as { displayName?: string }).displayName ?? "")],
  ].join(" ");

/**
 * 侧边栏选中项卡片（对齐 Satin `--sn-side-active` 与 `--sn-side-active-line`）：
 * 浅色为灰底上的清透白卡与细微托影，深色为半透明亮面与顶部微高光；
 * 保留 `bg-surface` 作为浅色基础类（兼容现有单测/E2E 语义检查）。
 */
export const SIDEBAR_ACTIVE_CARD =
  "bg-surface text-[var(--sn-label)] shadow-[0_0_0_1px_var(--sn-side-active-line,rgba(0,0,0,0.06)),0_1px_3px_rgba(0,0,0,0.06)] dark:bg-[var(--sn-side-active)] dark:shadow-[inset_0_0_0_1px_var(--sn-side-active-line,rgba(255,255,255,0.06)),inset_0_1px_0_rgba(255,255,255,0.05)]";

export const sidebarRowClass = (active: boolean) =>
  [
    "flex h-9 w-full min-w-0 items-center rounded-xl text-left text-sm whitespace-nowrap outline-none",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--sn-ease-out)] active:scale-[0.98]",
    active
      ? `${SIDEBAR_ACTIVE_CARD} font-medium`
      : "text-[var(--sn-label)] hover:bg-[var(--sn-fill-hover)]",
  ].join(" ");

export function SidebarRowIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center">
      <Icon
        size={18}
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
