import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { NavSection } from "./navModel";
import { SidebarGroup } from "./SidebarGroup";
import { sidebarRowClass, SidebarRowIcon, SidebarRowLabel } from "./sidebarRow";
import { useOpenGroups } from "./useOpenGroups";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 侧边栏导航：一列分区。只有一页的分区（仪表盘、系统信息）直接是那一页的链接；
 * 多页分区是可展开的标题 + 页面列表（见 SidebarGroup）。
 *
 * 桌面侧边栏与手机抽屉共用这一份：手机抽屉固定 collapsed=false，选中页面后调用 onSelect 收起抽屉。
 */
export function SidebarNav({
  sections,
  activeTo,
  collapsed,
  nav,
  onSelect,
}: {
  sections: readonly NavSection[];
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
  onSelect?: () => void;
}) {
  const { t } = useTranslation();
  const activeSection = useMemo(
    () => sections.find((section) => section.items.some((item) => item.to === activeTo)) ?? null,
    [activeTo, sections],
  );
  const { openIds, toggleGroup } = useOpenGroups(
    activeSection && !activeSection.single ? activeSection.id : null,
  );

  return (
    <nav
      aria-label={t("shell.nav_sections", { defaultValue: "Sections" })}
      className="flex flex-col gap-0.5 px-3 pt-1 pb-3"
    >
      {sections.map((section) =>
        section.single ? (
          <SingleSectionLink
            key={section.id}
            section={section}
            active={section.id === activeSection?.id}
            collapsed={collapsed}
            nav={nav}
            onSelect={onSelect}
          />
        ) : (
          <SidebarGroup
            key={section.id}
            section={section}
            active={section.id === activeSection?.id}
            open={openIds.has(section.id)}
            activeTo={activeTo}
            collapsed={collapsed}
            nav={nav}
            onToggle={toggleGroup}
            onSelect={onSelect}
          />
        ),
      )}
    </nav>
  );
}

/**
 * 只有一页的分区：整行就是那一页的链接。收起后只剩图标，悬停显示页面名提示
 * （展开时文字就在眼前，不再弹提示）。
 */
function SingleSectionLink({
  section,
  active,
  collapsed,
  nav,
  onSelect,
}: {
  section: NavSection;
  active: boolean;
  collapsed: boolean;
  nav: RouteNavigation;
  onSelect?: () => void;
}) {
  const { t } = useTranslation();
  const item = section.items[0];
  const label = t(item.i18nKey, { defaultValue: item.i18nKey });
  const tooltip = collapsed ? label : undefined;
  const content = (
    <>
      <SidebarRowIcon icon={section.icon} active={active} />
      <SidebarRowLabel collapsed={collapsed}>{label}</SidebarRowLabel>
    </>
  );

  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noreferrer"
        data-tooltip={tooltip}
        data-tooltip-placement="right"
        onClick={() => onSelect?.()}
        className={sidebarRowClass(false)}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      to={item.to}
      viewTransition
      aria-current={active ? "page" : undefined}
      data-tooltip={tooltip}
      data-tooltip-placement="right"
      onClick={(event) => nav.handleNavClick(event, item.to, onSelect)}
      onMouseEnter={() => nav.warmPageRoute(item.to)}
      onFocus={() => nav.warmPageRoute(item.to)}
      className={sidebarRowClass(active)}
    >
      {content}
    </Link>
  );
}
