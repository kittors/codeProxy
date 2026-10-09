import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { floatingPanelSurface, popoverEnterTransition, popoverExitTransition } from "@code-proxy/ui";
import type { NavSection } from "./navModel";
import { SidebarItemLink } from "./SidebarItemLink";
import { sidebarFadeClass, sidebarRowClass, SidebarRowIcon, SidebarRowLabel } from "./sidebarRow";
import type { RouteNavigation } from "./useRouteNavigation";

/**
 * 侧边栏里的多页分区。
 *
 * 展开态：标题行点一下展开 / 收起下面的页面列表（高度用 grid 行 0fr↔1fr 过渡，不用量高度）。
 * 当前页在这个分区里、但分区被收起时，标题行接过「选中」外观，用户仍看得出自己在哪。
 *
 * 收起态（只剩图标）：子项列表折叠隐藏，改成悬停 / 聚焦 / 点击时在右侧弹出分区浮层，
 * Esc 关闭并把焦点还给图标。
 *
 * 选中浮层里的页面后浮层立刻收起，并在指针离开之前不再因为「仍在悬停」而重新弹出
 * （suppressUntilPointerLeave）——否则点完链接浮层会一直挂着。
 *
 * 「指针离开」不能只靠 pointerleave：浮层是点完就卸载的，Chrome 不会给包着它的这一层补发
 * pointerleave，抑制标记就永远清不掉，之后悬停、聚焦都打不开浮层。所以抑制期间另挂一个
 * document 级的 pointermove，指针一出这块区域就复位；聚焦打开也只在「指针还停在这里」时
 * 才受抑制，键盘用户 Tab 回来照样能打开。
 */
export function SidebarGroup({
  section,
  active,
  open,
  activeTo,
  collapsed,
  nav,
  onToggle,
  onSelect,
}: {
  section: NavSection;
  /** 当前页属于这个分区。 */
  active: boolean;
  /** 展开态下子项列表是否展开。 */
  open: boolean;
  activeTo: string | null;
  collapsed: boolean;
  nav: RouteNavigation;
  onToggle: (sectionId: string) => void;
  /** 选中页面后的附加动作（手机抽屉用来收起自己）。 */
  onSelect?: () => void;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const suppressUntilPointerLeave = useRef(false);
  const pointerInside = useRef(false);
  const releaseSuppress = useRef<(() => void) | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = t(section.i18nKey, { defaultValue: section.i18nKey });
  const listVisible = open && !collapsed;

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
      onToggle(section.id);
      return;
    }
    if (flyoutOpen) closeAndSuppress();
    else {
      clearSuppress();
      setFlyoutOpen(true);
    }
  }, [clearSuppress, closeAndSuppress, collapsed, flyoutOpen, onToggle, section.id]);

  return (
    <div
      ref={wrapperRef}
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
        aria-expanded={collapsed ? flyoutOpen : open}
        aria-haspopup={collapsed ? "menu" : undefined}
        aria-controls={collapsed ? undefined : listId}
        data-sidebar-section={section.id}
        data-active={active ? "true" : undefined}
        onClick={handleClick}
        className={sidebarRowClass(active && !listVisible)}
      >
        <SidebarRowIcon icon={section.icon} active={active} />
        <SidebarRowLabel collapsed={collapsed}>{label}</SidebarRowLabel>
        <span className={`grid shrink-0 place-items-center ${sidebarFadeClass(collapsed)}`}>
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={[
              "mr-2.5 text-ink-3 transition-transform duration-200 ease-soft motion-reduce:transition-none",
              open ? "rotate-90" : "",
            ].join(" ")}
          />
        </span>
      </button>
      <div
        id={listId}
        role="group"
        aria-label={label}
        inert={!listVisible}
        className={[
          "grid transition-[grid-template-rows,opacity] duration-300 ease-soft motion-reduce:transition-none",
          listVisible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        {/*
          折叠动画要靠 overflow-hidden 把收起的行裁掉，但裁剪框若和行一样宽，选中项白卡片的描边
          与投影会被切掉一边（右侧看着像缺了竖线）。左右各外扩 1 格再用内边距收回，阴影就有地方画。
        */}
        <div className="-mx-1 min-h-0 overflow-hidden px-1">
          {/* 子项靠缩进表达层级、不画竖向引导线；子项文字与分区标题文字左对齐。 */}
          <div className="ml-4.5 space-y-0.5 py-1 pl-1.5">
            {section.items.map((item) => (
              <SidebarItemLink
                key={item.to}
                item={item}
                variant="tree"
                label={t(item.i18nKey, { defaultValue: item.i18nKey })}
                active={activeTo === item.to}
                onNavigate={nav.handleNavClick}
                onWarm={nav.warmPageRoute}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {collapsed && flyoutOpen ? (
          <SectionFlyout
            key="flyout"
            anchorRef={triggerRef}
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

/**
 * 收起态的分区浮层。用 fixed 定位贴在图标右侧：侧边栏的导航区是可滚动容器，absolute 的
 * 浮层会被它裁掉；fixed 的包含块是视口，不受祖先 overflow 影响，DOM 上又仍在分区这一层
 * 里面，指针 / 焦点的「是否还在区域内」判断照旧成立。
 */
function SectionFlyout({
  anchorRef,
  section,
  label,
  activeTo,
  nav,
  onSelect,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  section: NavSection;
  label: string;
  activeTo: string | null;
  nav: RouteNavigation;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // 顶边与图标对齐（上移 8px 抵消浮层内边距）；靠近底部时向上挪到完整可见为止（保留 12px 边距）。
  useLayoutEffect(() => {
    const anchor = anchorRef.current?.getBoundingClientRect();
    const own = ref.current?.getBoundingClientRect();
    if (!anchor || !own) return;
    const top = Math.min(anchor.top - 8, window.innerHeight - 12 - own.height);
    setPosition({ top: Math.max(12, top), left: anchor.right + 8 });
  }, [anchorRef]);

  return (
    <motion.div
      ref={ref}
      role="menu"
      aria-label={label}
      data-sidebar-flyout={section.id}
      // 与下拉、菜单同一套节奏：朝图标反方向滑出一点、从 0.96 放大，退场更快、位移减半。
      initial={{ opacity: 0, x: -4, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -2, scale: 0.98, transition: popoverExitTransition }}
      transition={popoverEnterTransition}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? undefined : "hidden",
        transformOrigin: "left top",
      }}
      // before: 伪元素在图标与浮层之间搭一座 12px 的「桥」，指针穿过空隙时不会触发离开。
      className={`${floatingPanelSurface} fixed z-50 w-60 p-2 before:absolute before:top-0 before:-left-3 before:h-full before:w-3`}
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
