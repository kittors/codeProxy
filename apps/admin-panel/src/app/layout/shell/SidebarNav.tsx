import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { NavSection } from "./navModel";
import { SidebarGroup } from "./SidebarGroup";
import { sidebarRowClass, SidebarRowIcon, SidebarRowLabel } from "./sidebarRow";
import { useOpenGroups } from "./useOpenGroups";
import type { RouteNavigation } from "./useRouteNavigation";

interface HighlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 侧边栏导航：一列分区，配套 Satin 流体滑动高亮条（`.cp-side-hl`）。
 * 只有一页的分区（仪表盘、系统信息）直接是那一页的链接；多页分区是可展开标题 + 页面列表。
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
  const navRef = useRef<HTMLElement | null>(null);
  const [hl, setHl] = useState<HighlightRect | null>(null);
  const [hlReady, setHlReady] = useState(false);

  const activeSection = useMemo(
    () => sections.find((section) => section.items.some((item) => item.to === activeTo)) ?? null,
    [activeTo, sections],
  );
  const { openIds, toggleGroup } = useOpenGroups(
    activeSection && !activeSection.single ? activeSection.id : null,
  );
  const openKey = useMemo(() => [...openIds].sort().join(","), [openIds]);

  useLayoutEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const sync = () => {
      const target =
        navEl.querySelector<HTMLElement>('a[aria-current="page"]') ??
        navEl.querySelector<HTMLElement>("button.cp-side-active");
      if (!target || target.offsetHeight === 0 || target.offsetWidth === 0) {
        setHl(null);
        return;
      }
      const navRect = navEl.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const next: HighlightRect = {
        top: targetRect.top - navRect.top,
        left: targetRect.left - navRect.left,
        width: targetRect.width,
        height: targetRect.height,
      };
      setHl((prev) =>
        prev &&
        Math.abs(prev.top - next.top) < 0.5 &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5 &&
        Math.abs(prev.height - next.height) < 0.5
          ? prev
          : next,
      );
      setHlReady(true);
    };
    sync();
    // 分组折叠动画结束后再校准一次落点，避免高度展开期间偏移。
    const timer = window.setTimeout(sync, 220);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(navEl);
    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
    };
  }, [activeTo, collapsed, openKey, sections]);

  return (
    <nav
      ref={navRef}
      aria-label={t("shell.nav_sections", { defaultValue: "Sections" })}
      data-side-hl={hl ? "active" : undefined}
      className="cp-side-nav relative flex flex-col gap-0.5 px-2.5 pt-1 pb-3"
    >
      {hl ? (
        <span
          aria-hidden="true"
          className={`cp-side-hl ${hlReady ? "cp-side-hl-anim" : ""}`}
          style={{
            transform: `translate3d(${hl.left}px, ${hl.top}px, 0)`,
            width: `${hl.width}px`,
            height: `${hl.height}px`,
          }}
        />
      ) : null}
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
