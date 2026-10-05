import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ACTIVE_ICON_STROKE, type SidebarNavItem } from "./navModel";

/**
 * 分区面板、收起后的浮层、手机抽屉共用的一行页面链接。
 *
 * 选中态：浅灰实底 + 加粗 + 图标线宽加到 2；悬停只铺一层更浅的叠层；按下轻微收缩。
 * 外链（menu.type === "link"）在新标签页打开，不走站内导航与进度条。
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
}) {
  const Icon = item.icon;
  const className = [
    "flex h-9 w-full min-w-0 items-center gap-3 rounded-xl px-2.5 text-sm whitespace-nowrap",
    "transition-[background-color,color,transform] duration-150 ease-soft active:scale-[0.985]",
    active
      ? "bg-selected font-semibold text-ink"
      : "font-normal text-ink hover:bg-hover",
  ].join(" ");
  const icon = (
    <Icon
      size={18}
      strokeWidth={active ? ACTIVE_ICON_STROKE : undefined}
      className={["shrink-0", active ? "text-ink" : "text-ink-2"].join(" ")}
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
