import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ACTIVE_ICON_STROKE, type SidebarNavItem } from "./navModel";
import { SIDEBAR_ACTIVE_CARD, sidebarIconClass } from "./sidebarRow";

/**
 * 分区下的一行页面链接，两种外观：
 *
 * - `tree`：侧边栏里展开的分区子项。只有文字，左侧靠极淡树形引导线表明层级；
 * - `menu`：侧边栏收起后悬停弹出的分区浮层。带图标，采用 Satin 菜单项视觉与节奏。
 */
export function SidebarItemLink({
  item,
  label,
  active,
  onNavigate,
  onWarm,
  onSelect,
  role,
  tabIndex,
  variant = "menu",
}: {
  item: SidebarNavItem;
  label: string;
  active: boolean;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, to: string, afterSelect?: () => void) => void;
  onWarm: (to: string) => void;
  /** 选中后的附加动作：收起浮层、关闭手机抽屉。 */
  onSelect?: () => void;
  role?: "menuitem";
  tabIndex?: number;
  variant?: "tree" | "menu";
}) {
  const Icon = item.icon;
  const className =
    variant === "tree"
      ? [
          "relative z-[1] flex h-8 w-full min-w-0 items-center rounded-lg px-[10px] text-sm whitespace-nowrap outline-none",
          "transition-[background-color,color,box-shadow,transform] duration-150 ease-[var(--sn-ease-out)] active:scale-[0.985]",
          active
            ? `${SIDEBAR_ACTIVE_CARD} font-medium`
            : "text-[var(--sn-label2)] hover:bg-[var(--sn-fill-hover)] hover:text-[var(--sn-label)]",
        ].join(" ")
      : [
          "flex h-8.5 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-sm whitespace-nowrap outline-none",
          "transition-[background-color,color,transform] duration-120 ease-[var(--sn-ease-out)] active:scale-[0.985]",
          active
            ? "bg-[var(--sn-fill-active)] font-medium text-[var(--sn-label)]"
            : "font-normal text-[var(--sn-label)] hover:bg-[var(--sn-b-ghost-hover)]",
        ].join(" ");
  const icon =
    variant === "tree" ? null : (
      <Icon
        size={16}
        strokeWidth={active ? ACTIVE_ICON_STROKE : undefined}
        className={["shrink-0", sidebarIconClass(Icon, active)].join(" ")}
        aria-hidden="true"
      />
    );

  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noreferrer"
        role={role}
        tabIndex={tabIndex}
        onClick={() => onSelect?.()}
        className={className}
      >
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </a>
    );
  }

  return (
    <Link
      to={item.to}
      viewTransition
      role={role}
      tabIndex={tabIndex}
      aria-current={active ? "page" : undefined}
      onClick={(event) => onNavigate(event, item.to, onSelect)}
      onMouseEnter={() => onWarm(item.to)}
      onFocus={() => onWarm(item.to)}
      className={className}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
