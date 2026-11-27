import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { NavSection } from "./navModel";
import { SidebarGroup } from "./SidebarGroup";
import { sidebarRowClass, SidebarRowIcon, SidebarRowLabel } from "./sidebarRow";
import { useOpenGroups } from "./useOpenGroups";
import type { RouteNavigation } from "./useRouteNavigation";

type HighlightMode = "instant" | "route" | "slide";

interface HighlightSnapshot {
  left: number;
  top: number;
  width: number;
  height: number;
  mode: HighlightMode;
}

/**
 * 找到当前真正可见的激活导航节点：
 * 跳过处于折叠分组（`[data-list-visible="false"]` / `[inert]`）内的 `a[aria-current="page"]`，
 * 否则分组收起或侧栏缩窄时仍会错选中隐藏抽屉里已被压扁的子项链接，导致白卡悬空错位。
 */
function findVisibleActiveTarget(navEl: HTMLElement): HTMLElement | null {
  const links = navEl.querySelectorAll<HTMLElement>('a[aria-current="page"]');
  for (const link of links) {
    if (link.closest('[data-list-visible="false"], [inert]')) continue;
    return link;
  }
  return navEl.querySelector<HTMLElement>("button.cp-side-active");
}

function measureHighlight(navEl: HTMLElement, target: HTMLElement): Omit<HighlightSnapshot, "mode"> | null {
  const navRect = navEl.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (targetRect.width < 1 || targetRect.height < 1) return null;
  return {
    left: targetRect.left - navRect.left,
    top: targetRect.top - navRect.top,
    width: targetRect.width,
    height: targetRect.height,
  };
}

function writeHighlightDom(hlEl: HTMLElement, rect: Omit<HighlightSnapshot, "mode">, mode?: HighlightMode) {
  if (mode) hlEl.dataset.mode = mode;
  hlEl.style.left = `${rect.left}px`;
  hlEl.style.transform = `translate3d(0, ${rect.top}px, 0)`;
  hlEl.style.width = `${rect.width}px`;
  hlEl.style.height = `${rect.height}px`;
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
  const hlRef = useRef<HTMLSpanElement | null>(null);
  const prevCollapsedRef = useRef(collapsed);
  const prevOpenKeyRef = useRef<string | null>(null);
  const prevTargetRef = useRef<HTMLElement | null>(null);
  const [hl, setHl] = useState<HighlightSnapshot | null>(null);

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

    const target = findVisibleActiveTarget(navEl);
    const collapsedChanged = prevCollapsedRef.current !== collapsed;
    const openChanged = prevOpenKeyRef.current !== null && prevOpenKeyRef.current !== openKey;
    const targetChanged = prevTargetRef.current !== null && prevTargetRef.current !== target;
    const isInitial = prevTargetRef.current === null;

    prevCollapsedRef.current = collapsed;
    prevOpenKeyRef.current = openKey;
    prevTargetRef.current = target;

    const rect = target ? measureHighlight(navEl, target) : null;
    if (!rect) {
      setHl(null);
      return;
    }

    let mode: HighlightMode = "instant";
    if (!isInitial) {
      if (collapsedChanged) {
        // 侧栏宽幅收起/展开期间：若目标在子项与父分组间切换，仅对纵移做平滑过渡，left 与 width 0ms 紧贴按钮零溢出；
        // 若目标未变（如仪表盘单项），宽高与位置全程瞬时紧贴。
        mode = targetChanged ? "slide" : "instant";
      } else if (openChanged) {
        // 展开态折叠/展开分组：目标切换（折起当前分组）走平滑滑移，目标未变（上方其他分组折起）60fps 紧跟不脱节。
        mode = targetChanged ? "route" : "instant";
      } else if (targetChanged) {
        mode = "route";
      }
    }

    if (hlRef.current) {
      writeHighlightDom(hlRef.current, rect, mode);
    } else {
      setHl({ ...rect, mode });
    }

    // 宽幅或分组折叠动画持续 ~280ms：用 rAF 在整段动画期内逐帧同步尺寸与坐标，彻底消除落点偏移与右缘裁切。
    let rafId = 0;
    const trackDurationMs = collapsedChanged ? 340 : openChanged ? 320 : 0;
    if (trackDurationMs > 0) {
      const startedAt = performance.now();
      const tick = (now: number) => {
        const currentTarget = findVisibleActiveTarget(navEl);
        const nextRect = currentTarget ? measureHighlight(navEl, currentTarget) : null;
        if (nextRect && hlRef.current) {
          writeHighlightDom(hlRef.current, nextRect);
        }
        if (now - startedAt < trackDurationMs) {
          rafId = window.requestAnimationFrame(tick);
        } else if (nextRect && hlRef.current) {
          // 动画彻底结束后恢复瞬时对齐，保证最终坐标 0px 误差。
          writeHighlightDom(hlRef.current, nextRect, "instant");
        }
      };
      rafId = window.requestAnimationFrame(tick);
    }

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            const currentTarget = findVisibleActiveTarget(navEl);
            const nextRect = currentTarget ? measureHighlight(navEl, currentTarget) : null;
            if (!nextRect) return;
            if (hlRef.current) {
              writeHighlightDom(hlRef.current, nextRect, trackDurationMs ? undefined : "instant");
            } else {
              setHl({ ...nextRect, mode: "instant" });
            }
          })
        : null;
    ro?.observe(navEl);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      ro?.disconnect();
    };
  }, [activeTo, collapsed, openKey, sections]);

  return (
    <nav
      ref={navRef}
      aria-label={t("shell.nav_sections", { defaultValue: "Sections" })}
      data-side-hl={hl ? "active" : undefined}
      className="cp-side-nav relative flex flex-col gap-0.5 px-[10px] pt-1 pb-3"
    >
      {hl ? (
        <span
          ref={hlRef}
          aria-hidden="true"
          data-mode={hl.mode}
          className="cp-side-hl"
          style={{
            left: `${hl.left}px`,
            transform: `translate3d(0, ${hl.top}px, 0)`,
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
