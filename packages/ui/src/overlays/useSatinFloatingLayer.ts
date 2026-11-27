import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  computeFloating,
  dropDismiss,
  getViewportBounds,
  hideTip,
  hitAny,
  pushDismiss,
  reduced,
  type FloatingPosition,
} from "satin-ui";
import { POPOVER_EXIT_MS } from "../utils/motion";

export type SatinFloatingPlacement = "top" | "right" | "bottom" | "left";
export type SatinFloatingAlign = "start" | "center" | "end";

export interface UseSatinFloatingLayerOptions {
  open: boolean;
  anchorRef: MutableRefObject<HTMLElement | null>;
  panelRef: MutableRefObject<HTMLElement | null>;
  placement?: SatinFloatingPlacement;
  align?: SatinFloatingAlign;
  gap?: number;
  margin?: number;
  /** 除 panelRef 与 anchorRef 之外仍视为浮层内部的节点（如多级子菜单）。 */
  extraInsideNodesRef?: MutableRefObject<Set<HTMLElement>>;
  /** 为 false 时不注册进全局 dismiss.js 栈（例如由父菜单托管的子菜单）。 */
  dismissable?: boolean;
  /** 焦点移出时是否自动关闭（默认 false，匹配 Satin 菜单行为）。 */
  focusOut?: boolean;
  /** 退场保留时长（毫秒），默认对齐 Satin POPOVER_EXIT_MS (160ms)。 */
  exitMs?: number;
  onClose?: (reason: "outside" | "escape" | "blur" | "programmatic", refocus: boolean) => void;
}

export interface SatinFloatingState {
  mounted: boolean;
  isOpen: boolean;
  top: number;
  left: number;
  origin: string;
  up: boolean;
  end: boolean;
  side: SatinFloatingPlacement;
  anchorWidth: number;
  availableHeight: number;
  ready: boolean;
  reposition: () => void;
}

function hasActiveCssTransition(el: HTMLElement | null): boolean {
  if (!el || typeof window === "undefined" || typeof window.getComputedStyle !== "function") {
    return false;
  }
  if (reduced()) return false;
  const raw = window.getComputedStyle(el).transitionDuration;
  if (!raw) return false;
  return raw.split(",").some((part) => {
    const trimmed = part.trim();
    const value = parseFloat(trimmed);
    return Number.isFinite(value) && value > 0;
  });
}

function resolveSide(
  requested: SatinFloatingPlacement,
  pos: FloatingPosition,
): SatinFloatingPlacement {
  if (pos.side === "left" || pos.side === "right") return pos.side;
  if (requested === "left" || requested === "right") return requested;
  return pos.up ? "top" : "bottom";
}

/**
 * Satin 统一浮层交互与定位 Hook：
 * - 定位直接调用 Satin 原生 `computeFloating`（智能避让顶栏、四边防溢出、空间不足自动翻转、变换原点对准锚点）；
 * - 浮层关闭与互斥直接接入 Satin 原生 `dismiss.js` 浮层栈（捕获阶段点外部关闭、Esc 后进先出、父子浮层保护、平级互斥）；
 * - 开合过渡由 Satin 原生 `.sn-menu.sn-float.sn-open` / `.sn-pop.sn-open` CSS 与 `@starting-style` 驱动；
 *   真实浏览器退场平滑播完 160ms 后卸载，无 CSS 过渡的测试环境即时卸载。
 */
export function useSatinFloatingLayer({
  open,
  anchorRef,
  panelRef,
  placement = "bottom",
  align = "start",
  gap = 6,
  margin = 8,
  extraInsideNodesRef,
  dismissable = true,
  focusOut = false,
  exitMs = POPOVER_EXIT_MS,
  onClose,
}: UseSatinFloatingLayerOptions): SatinFloatingState {
  const [mounted, setMounted] = useState(open);
  const exitTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [layout, setLayout] = useState<{
    top: number;
    left: number;
    origin: string;
    up: boolean;
    end: boolean;
    side: SatinFloatingPlacement;
    anchorWidth: number;
    availableHeight: number;
    ready: boolean;
  }>({
    top: 0,
    left: 0,
    origin: "top left",
    up: placement === "top",
    end: align === "end",
    side: placement,
    anchorWidth: 0,
    availableHeight: 320,
    ready: false,
  });

  // 打开时同步挂载，关闭时若有真实 CSS 退场过渡则保留 exitMs 播完 Satin 反向收束动画。
  if (open && !mounted) {
    setMounted(true);
  }

  useLayoutEffect(() => {
    if (open) {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setMounted(true);
      try {
        hideTip();
      } catch {
        // ignore
      }
      return undefined;
    }

    if (!mounted) return undefined;
    if (!hasActiveCssTransition(panelRef.current)) {
      setMounted(false);
      return undefined;
    }
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setMounted(false);
    }, exitMs);
    return () => {
      if (exitTimerRef.current !== null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [exitMs, mounted, open, panelRef]);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const ar = anchor.getBoundingClientRect();
    const bounds = getViewportBounds(margin);
    const pos = computeFloating(panel, anchor, {
      placement,
      align,
      gap,
      margin,
    });
    const nextSide = resolveSide(placement, pos);
    const nextOrigin = `${pos.ox}px ${pos.oy}px`;
    const nextAnchorWidth = Math.round(ar.width);
    const space = pos.up ? ar.top - bounds.top - gap : bounds.bottom - ar.bottom - gap;
    const nextAvailableHeight = Math.max(120, Math.floor(space));
    setLayout((prev) =>
      prev.top === pos.top &&
      prev.left === pos.left &&
      prev.origin === nextOrigin &&
      prev.up === pos.up &&
      prev.end === pos.end &&
      prev.side === nextSide &&
      prev.anchorWidth === nextAnchorWidth &&
      prev.availableHeight === nextAvailableHeight &&
      prev.ready
        ? prev
        : {
            top: pos.top,
            left: pos.left,
            origin: nextOrigin,
            up: pos.up,
            end: pos.end,
            side: nextSide,
            anchorWidth: nextAnchorWidth,
            availableHeight: nextAvailableHeight,
            ready: true,
          },
    );
  }, [align, anchorRef, gap, margin, panelRef, placement]);

  useLayoutEffect(() => {
    if (!open || !mounted) return undefined;
    reposition();
    const panel = panelRef.current;
    const observer =
      typeof ResizeObserver === "undefined" || !panel ? null : new ResizeObserver(reposition);
    if (panel) observer?.observe(panel);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("satin-reposition", reposition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("satin-reposition", reposition);
    };
  }, [mounted, open, panelRef, reposition]);

  useEffect(() => {
    if (!open || !mounted || !dismissable) return undefined;
    let active = true;
    const entry = {
      get panel() {
        return panelRef.current;
      },
      get trigger() {
        return anchorRef.current;
      },
      focusOut,
      blur: true,
      close(refocus = false) {
        if (!active) return;
        active = false;
        dropDismiss(entry);
        onCloseRef.current?.(refocus ? "escape" : "outside", Boolean(refocus));
      },
      contains(target: EventTarget | null, path: EventTarget[] | null) {
        const extras = extraInsideNodesRef ? Array.from(extraInsideNodesRef.current) : [];
        return hitAny(target, path, [panelRef.current, anchorRef.current, ...extras]);
      },
      ignore(target: EventTarget | null) {
        return target instanceof Element && Boolean(target.closest(".sn-tip, .sn-toasts"));
      },
    };
    pushDismiss(entry);
    return () => {
      active = false;
      dropDismiss(entry);
    };
  }, [anchorRef, dismissable, extraInsideNodesRef, focusOut, mounted, open, panelRef]);

  return {
    mounted: open || mounted,
    isOpen: open,
    top: layout.top,
    left: layout.left,
    origin: layout.origin,
    up: layout.up,
    end: layout.end,
    side: layout.side,
    anchorWidth: layout.anchorWidth,
    availableHeight: layout.availableHeight,
    ready: layout.ready,
    reposition,
  };
}
