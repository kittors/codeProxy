import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeft } from "lucide-react";
import { floatingPanelSurface } from "@code-proxy/ui";
import { LogoMark } from "@code-proxy/assets";
import { AccountMenu } from "./AccountMenu";
import { ACTIVE_ICON_STROKE, type NavSection } from "./navModel";
import { SidebarItemLink } from "./SidebarItemLink";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 图标栏条目：40×40、12px 圆角。选中项是一块白色小卡片（深色模式是浅一档的灰）加极轻投影，
 * 图标线宽加粗；悬停只铺一层浅灰叠层；按下轻微收缩。
 */
/** 收起快捷键的提示文字：苹果设备显示 ⌘B，其余显示 Ctrl+B。 */
const SHORTCUT_HINT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘B" : "Ctrl+B";

const railItemClass = (active: boolean) =>
  [
    "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl outline-none",
    "transition-[background-color,color,box-shadow,transform] duration-150 ease-soft active:scale-[0.94]",
    active
      ? "bg-surface text-ink shadow-[0_0_0_0.5px_rgb(0_0_0/0.06),0_1px_3px_rgb(0_0_0/0.08)] dark:shadow-none"
      : "text-ink-2 hover:bg-hover hover:text-ink",
  ].join(" ");

export function SidebarRail({
  sections,
  activeSectionId,
  activeTo,
  collapsed,
  nav,
  onToggleSidebar,
  onOpenSection,
  onLogout,
}: {
  sections: readonly NavSection[];
  activeSectionId: string | null;
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
  onToggleSidebar: () => void;
  /** 展开态点多页分区：切到该分区上次停留的页面。 */
  onOpenSection: (section: NavSection) => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  const toggleLabel = collapsed ? t("shell.expand_sidebar") : t("shell.collapse_sidebar");

  return (
    <nav
      aria-label={t("shell.nav_sections", { defaultValue: "Sections" })}
      className="relative z-30 flex h-full w-16 shrink-0 flex-col items-center gap-1.5 pt-3 pb-3.5"
    >
      {/*
        Logo 与收起按钮叠在同一个位置：平时显示 Logo，悬停或键盘聚焦时换成侧栏图标，
        点击切换收起/展开。两者共用一个按钮，所以收起前后它的位置和大小都不会变。
      */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={toggleLabel}
        aria-keyshortcuts="Meta+B Control+B"
        data-sidebar-toggle="true"
        data-tooltip={`${toggleLabel}  ${SHORTCUT_HINT}`}
        data-tooltip-placement="right"
        className="group/logo mb-2.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl outline-none transition-colors duration-150 ease-soft hover:bg-hover focus-visible:bg-hover"
      >
        <span
          data-sidebar-logo="true"
          className="col-start-1 row-start-1 grid place-items-center transition-[opacity,transform] duration-150 ease-soft group-hover/logo:scale-90 group-hover/logo:opacity-0 group-focus-visible/logo:scale-90 group-focus-visible/logo:opacity-0"
        >
          <LogoMark size={26} />
        </span>
        <PanelLeft
          size={20}
          aria-hidden="true"
          className="col-start-1 row-start-1 scale-90 text-ink-2 opacity-0 transition-[opacity,transform] duration-200 ease-soft group-hover/logo:scale-100 group-hover/logo:opacity-100 group-focus-visible/logo:scale-100 group-focus-visible/logo:opacity-100"
        />
      </button>

      {sections.map((section) =>
        section.single ? (
          <RailLink
            key={section.id}
            section={section}
            active={section.id === activeSectionId}
            nav={nav}
          />
        ) : (
          <RailSection
            key={section.id}
            section={section}
            active={section.id === activeSectionId}
            activeTo={activeTo}
            collapsed={collapsed}
            nav={nav}
            onOpenSection={onOpenSection}
          />
        ),
      )}

      <span className="flex-1" />
      <AccountMenu onLogout={onLogout} />
    </nav>
  );
}

/** 只有一页的分区（仪表盘、系统信息）：图标本身就是那一页的链接。 */
function RailLink({
  section,
  active,
  nav,
}: {
  section: NavSection;
  active: boolean;
  nav: RouteNavigation;
}) {
  const { t } = useTranslation();
  const item = section.items[0];
  const label = t(item.i18nKey, { defaultValue: item.i18nKey });
  const Icon = section.icon;
  const icon = (
    <Icon size={20} strokeWidth={active ? ACTIVE_ICON_STROKE : undefined} aria-hidden="true" />
  );

  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noreferrer"
        aria-label={label}
        data-tooltip={label}
        data-tooltip-placement="right"
        className={railItemClass(false)}
      >
        {icon}
      </a>
    );
  }

  return (
    <Link
      to={item.to}
      viewTransition
      aria-label={label}
      aria-current={active ? "page" : undefined}
      data-tooltip={label}
      data-tooltip-placement="right"
      onClick={(event) => nav.handleNavClick(event, item.to)}
      onMouseEnter={() => nav.warmPageRoute(item.to)}
      onFocus={() => nav.warmPageRoute(item.to)}
      className={railItemClass(active)}
    >
      {icon}
    </Link>
  );
}

/**
 * 多页分区。展开态点击切到该分区（面板随之换内容）；收起态没有面板，改成悬停 / 聚焦 /
 * 点击时在右侧弹出分区浮层，Esc 关闭并把焦点还给图标。
 *
 * 选中浮层里的页面后浮层立刻收起，并在指针离开之前不再因为「仍在悬停」而重新弹出
 * （suppressUntilPointerLeave）——否则点完链接浮层会一直挂着。
 *
 * 「指针离开」不能只靠 pointerleave：浮层是点完就卸载的，Chrome 不会给包着它的这一层补发
 * pointerleave，抑制标记就永远清不掉，之后悬停、聚焦都打不开浮层。所以抑制期间另挂一个
 * document 级的 pointermove，指针一出这块区域就复位；聚焦打开也只在「指针还停在这里」时
 * 才受抑制，键盘用户 Tab 回来照样能打开。
 */
function RailSection({
  section,
  active,
  activeTo,
  collapsed,
  nav,
  onOpenSection,
}: {
  section: NavSection;
  active: boolean;
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
  onOpenSection: (section: NavSection) => void;
}) {
  const { t } = useTranslation();
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const suppressUntilPointerLeave = useRef(false);
  const pointerInside = useRef(false);
  const releaseSuppress = useRef<(() => void) | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = t(section.i18nKey, { defaultValue: section.i18nKey });
  const Icon = section.icon;

  const clearSuppress = useCallback(() => {
    suppressUntilPointerLeave.current = false;
    releaseSuppress.current?.();
    releaseSuppress.current = null;
  }, []);

  const suppress = useCallback(() => {
    suppressUntilPointerLeave.current = true;
    if (releaseSuppress.current) return;
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && wrapperRef.current?.contains(target)) return;
      pointerInside.current = false;
      clearSuppress();
    };
    document.addEventListener("pointermove", onPointerMove, true);
    releaseSuppress.current = () => document.removeEventListener("pointermove", onPointerMove, true);
  }, [clearSuppress]);

  useEffect(() => clearSuppress, [clearSuppress]);

  useEffect(() => {
    if (collapsed) return;
    setFlyoutOpen(false);
    clearSuppress();
  }, [clearSuppress, collapsed]);

  const closeAndSuppress = useCallback(() => {
    suppress();
    setFlyoutOpen(false);
  }, [suppress]);

  const handlePointerEnter = useCallback(() => {
    pointerInside.current = true;
    if (collapsed && !suppressUntilPointerLeave.current) setFlyoutOpen(true);
  }, [collapsed]);

  const handleFocus = useCallback(() => {
    if (!collapsed) return;
    if (suppressUntilPointerLeave.current && pointerInside.current) return;
    setFlyoutOpen(true);
  }, [collapsed]);

  const handlePointerLeave = useCallback(() => {
    pointerInside.current = false;
    setFlyoutOpen(false);
    clearSuppress();
  }, [clearSuppress]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
      setFlyoutOpen(false);
      clearSuppress();
    },
    [clearSuppress],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Escape" || !flyoutOpen) return;
      event.preventDefault();
      // 焦点回到图标时会再触发一次聚焦打开，先压住这一次，下一个微任务再放开。
      suppressUntilPointerLeave.current = true;
      const wasInside = pointerInside.current;
      pointerInside.current = true;
      setFlyoutOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
      queueMicrotask(() => {
        suppressUntilPointerLeave.current = false;
        pointerInside.current = wasInside;
      });
    },
    [flyoutOpen],
  );

  const handleClick = useCallback(() => {
    if (!collapsed) {
      onOpenSection(section);
      return;
    }
    if (flyoutOpen) closeAndSuppress();
    else {
      clearSuppress();
      setFlyoutOpen(true);
    }
  }, [clearSuppress, closeAndSuppress, collapsed, flyoutOpen, onOpenSection, section]);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      // 收起态由浮层自己展示分区名，不再叠一个提示气泡。
      data-tooltip-managed={collapsed ? "true" : undefined}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup={collapsed ? "menu" : undefined}
        aria-expanded={collapsed ? flyoutOpen : undefined}
        data-sidebar-section={section.id}
        data-active={active ? "true" : undefined}
        data-tooltip-placement="right"
        onClick={handleClick}
        className={railItemClass(active)}
      >
        <Icon size={20} strokeWidth={active ? ACTIVE_ICON_STROKE : undefined} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {collapsed && flyoutOpen ? (
          <SectionFlyout
            key="flyout"
            section={section}
            label={label}
            activeTo={activeTo}
            nav={nav}
            onSelect={closeAndSuppress}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function SectionFlyout({
  section,
  label,
  activeTo,
  nav,
  onSelect,
}: {
  section: NavSection;
  label: string;
  activeTo: string | null;
  nav: RouteNavigation;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [shiftY, setShiftY] = useState(0);

  // 靠近底部的分区，浮层向上挪到完整可见为止（保留 12px 边距）。
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const overflow = rect.bottom - (window.innerHeight - 12);
    setShiftY(overflow > 0 ? -overflow : 0);
  }, []);

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label={label}
      data-sidebar-flyout={section.id}
      initial={{ opacity: 0, x: -6, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -4, scale: 0.98, transition: { duration: 0.14 } }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ top: shiftY - 8, transformOrigin: "left center" }}
      // before: 伪元素在图标与浮层之间搭一座 12px 的「桥」，指针穿过空隙时不会触发离开。
      className={`${floatingPanelSurface} absolute left-full z-50 ml-2 w-60 p-2 before:absolute before:top-0 before:-left-3 before:h-full before:w-3`}
    >
      <div className="px-2.5 pt-1.5 pb-1.5 text-xs font-semibold text-ink-3">{label}</div>
      <div className="space-y-0.5">
        {section.items.map((item) => (
          <SidebarItemLink
            key={item.to}
            item={item}
            label={t(item.i18nKey, { defaultValue: item.i18nKey })}
            active={activeTo === item.to}
            onNavigate={nav.handleNavClick}
            onWarm={nav.warmPageRoute}
            onSelect={onSelect}
            role="menuitem"
          />
        ))}
      </div>
    </motion.div>
  );
}
