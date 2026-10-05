import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ACTIVE_ICON_STROKE } from "./navModel";

/**
 * 侧边栏顶层一行（单页分区的链接、多页分区的标题）共用的外观。
 *
 * 图标固定放在一个 h-9（2.25rem）见方的格子里，格子贴着行的左边：侧边栏收窄成图标栏时，
 * 行宽正好缩到这个格子大小，所以图标在展开 / 收起之间一动不动，只有文字淡出、被裁掉。
 */

/** 选中项：灰底上的一块白色小卡片（深色模式是浅一档的灰）加极轻投影。 */
export const SIDEBAR_ACTIVE_CARD =
  "bg-surface text-ink shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_1px_3px_rgb(0_0_0/0.08)] dark:shadow-none";

export const sidebarRowClass = (active: boolean) =>
  [
    "flex h-9 w-full min-w-0 items-center rounded-xl text-left text-sm whitespace-nowrap outline-none",
    "transition-[background-color,color,box-shadow,scale] duration-150 ease-soft active:scale-[0.98]",
    active ? `${SIDEBAR_ACTIVE_CARD} font-medium` : "text-ink hover:bg-hover",
  ].join(" ");

export function SidebarRowIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span className="grid size-9 shrink-0 place-items-center">
      <Icon
        size={18}
        strokeWidth={active ? ACTIVE_ICON_STROKE : undefined}
        className={active ? "text-ink" : "text-ink-2"}
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
    "transition-opacity ease-soft motion-reduce:transition-none",
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
