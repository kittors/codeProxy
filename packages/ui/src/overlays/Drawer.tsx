import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { reduced } from "satin-ui";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { useScrollFade } from "../hooks/useScrollFade";
import {
  cssEase,
  DRAWER_EXIT_MS,
  EASE_OUT,
  OVERLAY_NUDGE_MS,
} from "../utils/motion";
import { DialogIcon, type DialogTone } from "./DialogIcon";
import { useOverlayPresence } from "./overlayMotion";
import {
  useDialogBehavior,
  useInteractionGuard,
  type DialogInitialFocus,
} from "./useDialogBehavior";

function isMotionReduced(): boolean {
  try {
    return reduced();
  } catch {
    return false;
  }
}

export function Drawer({
  open,
  title,
  description,
  icon,
  tone = "auto",
  footer,
  widthClassName = "w-[min(720px,100vw)]",
  bodyClassName,
  initialFocus = "panel",
  dirty,
  onBlockedClose,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: ReactNode;
  /** 标题左侧的图标块，与 Modal 同一种样式。 */
  icon?: ReactNode;
  tone?: DialogTone;
  footer?: ReactNode;
  widthClassName?: string;
  bodyClassName?: string;
  /** 抽屉多用来查看详情，默认只把焦点放在面板上，不去点亮第一个输入框。 */
  initialFocus?: DialogInitialFocus;
  /** 与 Modal 相同：不传时输入过文字后点遮罩只轻顶；传 true 时 Esc 也拦下；传 false 时直接关闭。 */
  dirty?: boolean;
  onBlockedClose?: () => void;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  // 与 Satin .sn-drawer 同步：两帧后挂 .sn-open 启动 320ms --sn-ease-open 滑入，关闭等待 220ms 滑出后卸载。
  const { mounted, visible } = useOverlayPresence(open, DRAWER_EXIT_MS);
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const nudgeTimerRef = useRef<number | null>(null);
  const [nudging, setNudging] = useState(false);
  const { interacted, onInput } = useInteractionGuard(open);

  /** Satin 原生轻顶反馈：WAAPI 原地微弹 scale(1 -> 1.015 -> 1) 260ms `--sn-ease-out`。 */
  const nudge = useCallback(() => {
    const panel = panelRef.current;
    setNudging(true);
    if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = window.setTimeout(() => {
      setNudging(false);
      nudgeTimerRef.current = null;
    }, OVERLAY_NUDGE_MS);

    if (panel && !isMotionReduced() && typeof panel.animate === "function") {
      panel.animate(
        [
          { transform: "none", transformOrigin: "50% 50%" },
          { transform: "scale(1.015)", transformOrigin: "50% 50%" },
          { transform: "none", transformOrigin: "50% 50%" },
        ],
        { duration: OVERLAY_NUDGE_MS, easing: cssEase(EASE_OUT) },
      );
    }
    onBlockedClose?.();
  }, [onBlockedClose]);

  useEffect(
    () => () => {
      if (nudgeTimerRef.current !== null) {
        window.clearTimeout(nudgeTimerRef.current);
        nudgeTimerRef.current = null;
      }
    },
    [],
  );

  const guardBackdrop = dirty ?? interacted;
  const guardRef = useRef(guardBackdrop);
  guardRef.current = guardBackdrop;
  const actionsRef = useRef({ onClose, nudge });
  actionsRef.current = { onClose, nudge };

  const handleEscape = useCallback(() => {
    if (dirty === true) {
      nudge();
      return;
    }
    onClose();
  }, [dirty, nudge, onClose]);

  // 与 Modal 同一套叠层：抽屉里再打开的确认框按 Esc 只关确认框；Tab 不会跑到背后的页面。
  useDialogBehavior({ open, visible, panelRef, onEscape: handleEscape, initialFocus });
  const fade = useScrollFade<HTMLDivElement>({ enabled: mounted });

  // Satin 原生触屏右滑关闭手势（对齐 overlay.js:466-489）：拖过 30% 宽或快甩即关闭；有未保存修改时弹回轻顶。
  useEffect(() => {
    const drawer = panelRef.current;
    if (!mounted || !drawer) return;

    let swipe: { x: number; y: number; t: number; dx: number; on: boolean; id: number } | null =
      null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch" || !drawer.classList.contains("sn-open")) return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], .sn-slider, .sn-seg, .sn-tab-list",
        )
      ) {
        return;
      }
      const scrollView = target?.closest<HTMLElement>(".sn-sa-vp, [data-scroll-area-viewport]");
      if (scrollView && scrollView.scrollWidth > scrollView.clientWidth + 1) return;
      swipe = {
        x: event.clientX,
        y: event.clientY,
        t: event.timeStamp,
        dx: 0,
        on: false,
        id: event.pointerId,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!swipe || event.pointerId !== swipe.id) return;
      const dx = event.clientX - swipe.x;
      const dy = event.clientY - swipe.y;
      if (!swipe.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          swipe = null;
          return;
        }
        if (dx < 8) return;
        swipe.on = true;
        try {
          drawer.setPointerCapture?.(event.pointerId);
        } catch {
          // ignore
        }
        drawer.style.transition = "none";
      }
      swipe.dx = Math.max(0, dx);
      drawer.style.translate = `${swipe.dx}px 0`;
    };

    const onSwipeEnd = (event: PointerEvent) => {
      if (!swipe || event.pointerId !== swipe.id) return;
      const current = swipe;
      swipe = null;
      if (!current.on) return;
      const velocity = current.dx / Math.max(1, event.timeStamp - current.t);
      const shouldClose =
        event.type === "pointerup" &&
        (current.dx > drawer.offsetWidth * 0.3 || velocity > 0.6);
      drawer.style.transition = "";
      drawer.style.translate = "";
      if (shouldClose) {
        if (guardRef.current) actionsRef.current.nudge();
        else actionsRef.current.onClose();
      }
    };

    drawer.addEventListener("pointerdown", onPointerDown);
    drawer.addEventListener("pointermove", onPointerMove);
    drawer.addEventListener("pointerup", onSwipeEnd);
    drawer.addEventListener("pointercancel", onSwipeEnd);
    return () => {
      drawer.removeEventListener("pointerdown", onPointerDown);
      drawer.removeEventListener("pointermove", onPointerMove);
      drawer.removeEventListener("pointerup", onSwipeEnd);
      drawer.removeEventListener("pointercancel", onSwipeEnd);
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        data-overlay-backdrop=""
        onClick={() => {
          if (!open) return;
          if (guardBackdrop) {
            nudge();
            return;
          }
          onClose();
        }}
        // 遮罩不是一个「关闭」按钮：填过内容后点它只会轻顶。与 Modal 一样对读屏和 Tab 隐藏。
        aria-hidden="true"
        tabIndex={-1}
        className={["sn-drawer-scrim cp-drawer-scrim cursor-default", visible ? "sn-open" : ""]
          .filter(Boolean)
          .join(" ")}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-state={visible ? "open" : open ? "entering" : "closing"}
        data-nudging={nudging ? "true" : undefined}
        onInput={onInput}
        className={[
          `sn-drawer cp-drawer-panel ${widthClassName} [--cp-backdrop:var(--sn-overlay)]`,
          visible ? "sn-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* 抽屉内容通常很长：头尾不画硬分隔线，正文滚动时上下渐隐，和 Modal 一致。 */}
        <div className="flex shrink-0 items-start justify-between gap-3 py-3.5 pr-4 pl-5">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <DialogIcon tone={tone}>{icon}</DialogIcon> : null}
            <div className={["min-w-0", icon ? "pt-px" : "pt-0.5"].join(" ")}>
              <h2 id={titleId} className="truncate text-base font-semibold tracking-tight text-ink">
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className="mt-0.5 text-sm text-ink-2">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            data-kbd="Esc"
            className="sn-btn sn-ghost sn-sm sn-ibtn sn-round shrink-0"
            aria-label={t("common.close")}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div
          ref={fade.ref}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 ${bodyClassName ?? ""}`}
        >
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
