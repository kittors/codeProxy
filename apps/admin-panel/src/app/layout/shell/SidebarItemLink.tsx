import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ACTIVE_ICON_STROKE, type SidebarNavItem } from "./navModel";
import { SIDEBAR_ACTIVE_CARD, sidebarIconClass } from "./sidebarRow";

/**
 * 分区下的一行页面链接，两种外观：
 *
 * - `tree`：侧边栏里展开的分区子项。只有文字，左侧靠分区的竖向引导线表明层级——分区标题
 *   已经有图标，子项再各带一个图标会让两层图标挤在一起、分不清主次。
 * - `menu`：侧边栏收起后悬停弹出的分区浮层。带图标，浅灰实底表示当前页。
 *
 * 悬停只铺一层浅灰叠层；按下轻微收缩。外链（menu.type === "link"）在新标签页打开，
 * 不走站内导航与进度条。
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
          "flex h-8 w-full min-w-0 items-center rounded-lg px-2.5 text-sm whitespace-nowrap",
          "transition-[background-color,color,box-shadow,scale] duration-150 ease-soft active:scale-[0.98]",
          active ? `${SIDEBAR_ACTIVE_CARD} font-medium` : "text-ink-2 hover:bg-hover hover:text-ink",
        ].join(" ")
      : [
          "flex h-9 w-full min-w-0 items-center gap-3 rounded-xl px-2.5 text-sm whitespace-nowrap",
          "transition-[background-color,color,scale] duration-150 ease-soft active:scale-[0.985]",
          active ? "bg-selected font-semibold text-ink" : "font-normal text-ink hover:bg-hover",
        ].join(" ");
  const icon =
    variant === "tree" ? null : (
      <Icon
        size={18}
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
