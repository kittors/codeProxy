import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { hideTip, reduced, resetTipLayer } from "satin-ui";
import { Icon } from "satin-ui/react";
import { useScrollFade } from "../hooks/useScrollFade";
import {
  cssEase,
  EASE_IN,
  EASE_OUT,
  EASE_POP,
  OVERLAY_ENTER_MS,
  OVERLAY_EXIT_MS,
  OVERLAY_NUDGE_MS,
  OVERLAY_PANEL_EXIT_MS,
  OVERLAY_TRANSFORM_ENTER_MS,
} from "../utils/motion";
import { DialogIcon, type DialogTone } from "./DialogIcon";
import { useOverlayPresence } from "./overlayMotion";
import {
  hideTopLayerPopover,
  notifyTopLayerDialogOpened,
  showTopLayerPopover,
} from "./portalContainer";
import {
  useDialogBehavior,
  useInteractionGuard,
  type DialogInitialFocus,
} from "./useDialogBehavior";

/** Satin 弹窗关闭按钮：无底色圆形图标按钮，带物理按压微缩放与 Esc 快捷键提示。 */
const CLOSE_BUTTON_CLASS = "sn-btn sn-ghost sn-sm sn-ibtn sn-round shrink-0";

/** 标题栏内不可作为拖拽把手的交互元素选择器（对齐 Satin `overlay.js`）。 */
const DLG_NO_DRAG =
  "button, a, input, textarea, select, [role='button'], [data-x], [data-cancel], [data-no-drag]";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

/**
 * 宽度档位按内容类型选：sm 确认框与单个输入；md 常规表单（一到两列）；lg 带分区的长表单、
 * 详情；xl 双栏（左导航 + 右内容）与表格类；2xl 编辑器类。
 */
const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  "2xl": "max-w-6xl",
};

function safeHideTip() {
  try {
    hideTip();
  } catch {
    // 兼容测试环境
  }
}

function safeResetTipLayer() {
  try {
    resetTipLayer();
  } catch {
    // 兼容测试环境
  }
}

function isMotionReduced(): boolean {
  try {
    return reduced();
  } catch {
    return false;
  }
}

function isMobileSheetViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 639px)").matches;
}

export function Modal({
  open,
  title,
  titleAccessory,
  description,
  icon,
  tone = "auto",
  size,
  footer,
  footerStart,
  maxWidth,
  panelClassName,
  bodyHeightClassName,
  bodyOverflowClassName,
  bodyClassName,
  bodyTestId,
  hideHeader = false,
  closable = true,
  onBlockedClose,
  dirty,
  initialFocus = "auto",
  onSubmitShortcut,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  /** 标题左侧的图标块：说明这个弹窗在处理什么（用户、密钥、规则……）。 */
  icon?: ReactNode;
  /** 图标块色调；红色只给删除这类不可恢复的操作。 */
  tone?: DialogTone;
  /** 宽度档位；显式传 maxWidth 时以 maxWidth 为准（兼容旧调用）。 */
  size?: ModalSize;
  footer?: ReactNode;
  /** 尾部左侧的辅助信息（例如「已选 3 项」「保存后立即生效」），按钮仍在右侧。 */
  footerStart?: ReactNode;
  maxWidth?: string;
  panelClassName?: string;
  bodyHeightClassName?: string;
  bodyOverflowClassName?: string;
  bodyClassName?: string;
  bodyTestId?: string;
  hideHeader?: boolean;
  /**
   * 不允许用户关闭（强制改密、正在升级这类必须走完的流程）：不显示关闭按钮，
   * Esc 和点遮罩只会让面板轻顶提示。由调用方在流程结束后自己把 open 置为 false。
   */
  closable?: boolean;
  /** 关闭被拦下时（不可关闭、或有未保存修改时按了 Esc / 点了遮罩）通知调用方，例如亮出原因。 */
  onBlockedClose?: () => void;
  /**
   * 有未保存的修改。不传时自动判断：在弹窗里输入过文字后，点遮罩不再关闭（面板轻顶提示）。
   * 传 true 时 Esc 也会被拦下；传 false 时永远直接关闭。关闭按钮和取消按钮任何时候都有效。
   */
  dirty?: boolean;
  /** 打开时的焦点：auto 聚焦第一个可填写的控件；panel 只聚焦弹窗本身；none 不动焦点。 */
  initialFocus?: DialogInitialFocus;
  /** ⌘ / Ctrl + Enter 触发的主操作。 */
  onSubmitShortcut?: () => void;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const { mounted, visible } = useOverlayPresence(open, OVERLAY_EXIT_MS);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const portalHostRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const activeAnimsRef = useRef<Animation[]>([]);
  const nudgeTimerRef = useRef<number | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const justDraggedRef = useRef(false);
  const [nudging, setNudging] = useState(false);
  const { interacted, onInput } = useInteractionGuard(open);

  // 在弹窗渲染打开瞬间捕获触发按钮，供 Satin 1/3 原点缩放动效计算起点。
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpenRef.current = open;

  // Snapshot title/description/footer/children while open so parents can clear
  // props immediately without collapsing the panel mid-exit animation.
  const contentRef = useRef({
    title,
    titleAccessory,
    description,
    icon,
    footer,
    footerStart,
    children,
  });
  if (open) {
    contentRef.current = {
      title,
      titleAccessory,
      description,
      icon,
      footer,
      footerStart,
      children,
    };
  }
  const snapshot = contentRef.current;

  const cancelRunningAnims = useCallback(() => {
    for (const anim of activeAnimsRef.current) {
      try {
        anim.cancel();
      } catch {
        // ignore
      }
    }
    activeAnimsRef.current = [];
  }, []);

  /** Satin 原生轻顶反馈：WAAPI 原地微弹 scale(1 -> 1.015 -> 1) 260ms `--sn-ease-out`。 */
  const nudge = useCallback(() => {
    const dialog = dialogRef.current;
    setNudging(true);
    if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current);
    nudgeTimerRef.current = window.setTimeout(() => {
      setNudging(false);
      nudgeTimerRef.current = null;
    }, OVERLAY_NUDGE_MS);

    if (dialog && !isMotionReduced() && typeof dialog.animate === "function") {
      dialog.animate(
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

  const guardBackdrop = !closable || (dirty ?? interacted);
  const handleEscape = useCallback(() => {
    if (!closable || dirty === true) {
      nudge();
      return;
    }
    onClose();
  }, [closable, dirty, nudge, onClose]);

  useDialogBehavior({
    open,
    visible,
    panelRef: dialogRef,
    onEscape: handleEscape,
    onSubmitShortcut,
    initialFocus,
  });

  // 原生 <dialog>.showModal() 与 Top Layer 浮层宿主生命周期同步。
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog) return;

    if (open) {
      cancelRunningAnims();
      if (!dialog.open) {
        safeResetTipLayer();
        dragOffsetRef.current = { x: 0, y: 0 };
        dialog.style.translate = "";
        dialog.classList.remove("sn-dragging", "sn-shown");
        // 通过数据属性配合 CSS 隐藏首两帧（避免写入行内 style.opacity = "0" 干扰无障碍可见性判定）。
        dialog.setAttribute("data-modal-entering", "true");
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            dialog.setAttribute("open", "");
          }
        } else {
          dialog.setAttribute("open", "");
        }
        // showModal() 会默认把焦点放到弹窗首个可聚焦元素（通常是右上角关闭按钮），
        // 先归位到弹窗自身，让 useDialogBehavior 两帧后严格按 initialFocus 落焦。
        const currentFocus = document.activeElement;
        if (currentFocus instanceof HTMLElement && currentFocus.matches("[data-modal-close]")) {
          dialog.focus({ preventScroll: true });
        }
        showTopLayerPopover(portalHostRef.current);
        notifyTopLayerDialogOpened();
      } else {
        // 退场中途再次打开：确保浮层宿主重新处于 Top Layer 之上。
        showTopLayerPopover(portalHostRef.current);
      }
      return;
    }

    // 开始退场：同步收起 ::backdrop（.sn-shown 移除）并在拖拽后的原地微缩淡出。
    cancelRunningAnims();
    dialog.removeAttribute("data-modal-entering");
    dialog.classList.remove("sn-shown", "sn-dragging");
    safeHideTip();
    if (typeof dialog.animate === "function") {
      const exitEase = cssEase(EASE_IN);
      const anims: Animation[] = [
        dialog.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: isMotionReduced() ? 150 : OVERLAY_PANEL_EXIT_MS,
          easing: exitEase,
          fill: "forwards",
        }),
      ];
      if (!isMotionReduced()) {
        anims.push(
          dialog.animate([{ transform: "none" }, { transform: "scale(0.97)" }], {
            duration: OVERLAY_PANEL_EXIT_MS,
            easing: exitEase,
            fill: "forwards",
          }),
        );
      }
      activeAnimsRef.current = anims;
    }
  }, [cancelRunningAnims, mounted, open]);

  // 两帧后正式播放 Satin 进场动画（1/3 触发原点缩放 0.96 -> 1 + 140ms 淡入 + ::backdrop 200ms 淡入）。
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !open || !visible || !dialog) return;

    const b = dialog.getBoundingClientRect();
    const trig = triggerRef.current;
    const tr = trig?.isConnected ? trig.getBoundingClientRect() : null;
    if (b.width > 0 && b.height > 0 && tr && (tr.width > 0 || tr.height > 0)) {
      const ox = b.width / 2 + (tr.left + tr.width / 2 - b.left - b.width / 2) / 3;
      const oy = b.height / 2 + (tr.top + tr.height / 2 - b.top - b.height / 2) / 3;
      dialog.style.transformOrigin = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
    } else {
      dialog.style.transformOrigin = "50% 50%";
    }

    dialog.removeAttribute("data-modal-entering");
    dialog.classList.add("sn-shown");
    cancelRunningAnims();
    if (typeof dialog.animate === "function") {
      const anims: Animation[] = [
        dialog.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: isMotionReduced() ? 150 : OVERLAY_ENTER_MS,
          easing: cssEase(EASE_OUT),
        }),
      ];
      if (!isMotionReduced()) {
        anims.push(
          dialog.animate([{ transform: "scale(0.96)" }, { transform: "none" }], {
            duration: OVERLAY_TRANSFORM_ENTER_MS,
            easing: cssEase(EASE_POP),
          }),
        );
      }
      activeAnimsRef.current = anims;
    }
  }, [cancelRunningAnims, mounted, open, visible]);

  // 彻底卸载时关闭原生 dialog 与 Top Layer 浮层宿主。
  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    const portalHost = portalHostRef.current;
    return () => {
      cancelRunningAnims();
      hideTopLayerPopover(portalHost);
      if (dialog) {
        dragOffsetRef.current = { x: 0, y: 0 };
        dialog.style.translate = "";
        dialog.classList.remove("sn-shown", "sn-dragging");
        if (dialog.open && typeof dialog.close === "function") {
          try {
            dialog.close();
          } catch {
            // ignore
          }
        }
      }
    };
  }, [cancelRunningAnims, mounted]);

  // Satin 标题栏拖拽 + 双击平滑复位（完整对齐 overlay.js:372-431，移动端贴底形态自动禁用）。
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog || hideHeader) return;

    let dragState: {
      id: number;
      sx: number;
      sy: number;
      ox: number;
      oy: number;
      moved: boolean;
      base: { left: number; top: number; w: number; h: number };
    } | null = null;

    const clampDrag = (x: number, y: number, base: { left: number; top: number; w: number; h: number }) => {
      const pad = 8;
      const minVisX = Math.min(96, base.w);
      const minVisY = 56;
      const minX = pad - base.left - Math.max(0, base.w - minVisX);
      const maxX = window.innerWidth - pad - base.left - minVisX;
      const minY = pad - base.top;
      const maxY = window.innerHeight - minVisY - base.top;
      return {
        x: Math.round(Math.max(Math.min(minX, maxX), Math.min(Math.max(minX, maxX), x))),
        y: Math.round(Math.max(Math.min(minY, maxY), Math.min(Math.max(minY, maxY), y))),
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isMobileSheetViewport() || !dialog.open) return;
      const target = event.target instanceof Element ? event.target : null;
      const hd = target?.closest(".sn-hd");
      if (!hd || !dialog.contains(hd) || target?.closest(DLG_NO_DRAG)) return;
      const cur = dragOffsetRef.current;
      const rect = dialog.getBoundingClientRect();
      dragState = {
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        ox: cur.x,
        oy: cur.y,
        moved: false,
        base: {
          left: rect.left - cur.x,
          top: rect.top - cur.y,
          w: rect.width,
          h: rect.height,
        },
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragState || event.pointerId !== dragState.id) return;
      const dx = event.clientX - dragState.sx;
      const dy = event.clientY - dragState.sy;
      if (!dragState.moved) {
        if (Math.hypot(dx, dy) < 3) return;
        dragState.moved = true;
        dialog.classList.add("sn-dragging");
        try {
          dialog.setPointerCapture?.(event.pointerId);
        } catch {
          // ignore
        }
      }
      const next = clampDrag(dragState.ox + dx, dragState.oy + dy, dragState.base);
      dragOffsetRef.current = next;
      dialog.style.translate = `${next.x}px ${next.y}px`;
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragState || event.pointerId !== dragState.id) return;
      const was = dragState;
      dragState = null;
      if (was.moved) {
        justDraggedRef.current = true;
        window.setTimeout(() => {
          justDraggedRef.current = false;
        }, 0);
        dialog.classList.remove("sn-dragging");
        try {
          dialog.releasePointerCapture?.(event.pointerId);
        } catch {
          // ignore
        }
      }
    };

    const onDblClick = (event: MouseEvent) => {
      if (isMobileSheetViewport() || !dialog.open) return;
      const target = event.target instanceof Element ? event.target : null;
      const hd = target?.closest(".sn-hd");
      if (!hd || !dialog.contains(hd) || target?.closest(DLG_NO_DRAG)) return;
      const cur = dragOffsetRef.current;
      if (cur.x === 0 && cur.y === 0) return;
      const from = `${cur.x}px ${cur.y}px`;
      dragOffsetRef.current = { x: 0, y: 0 };
      dialog.style.translate = "";
      if (!isMotionReduced() && typeof dialog.animate === "function") {
        dialog.animate([{ translate: from }, { translate: "0px 0px" }], {
          duration: 220,
          easing: cssEase(EASE_POP),
        });
      }
    };

    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointermove", onPointerMove);
    dialog.addEventListener("pointerup", endDrag);
    dialog.addEventListener("pointercancel", endDrag);
    dialog.addEventListener("dblclick", onDblClick);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointermove", onPointerMove);
      dialog.removeEventListener("pointerup", endDrag);
      dialog.removeEventListener("pointercancel", endDrag);
      dialog.removeEventListener("dblclick", onDblClick);
    };
  }, [hideHeader, mounted]);

  // 内容溢出时上下渐隐，代替以前滚动后浮出的头尾分隔线：没有硬边，也看得出「还能往下滚」。
  const fade = useScrollFade<HTMLDivElement>({ enabled: mounted });

  if (!mounted) return null;

  const bodyHeightCls = bodyHeightClassName ?? "max-h-[70vh]";
  const bodyOverflowCls = bodyOverflowClassName ?? "overflow-y-auto";
  const widthCls = maxWidth ?? SIZE_CLASS[size ?? "lg"];
  const hasDescription = Boolean(snapshot.description) && !hideHeader;

  return createPortal(
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={hideHeader ? snapshot.title : undefined}
      aria-labelledby={hideHeader ? undefined : titleId}
      aria-describedby={hasDescription ? descriptionId : undefined}
      tabIndex={-1}
      data-modal-dialog=""
      data-state={visible ? "open" : open ? "entering" : "closing"}
      data-nudging={nudging ? "true" : undefined}
      data-draggable={hideHeader ? "false" : undefined}
      onInput={onInput}
      onCancel={(event) => {
        // 原生 <dialog> 按 Esc 会触发 cancel 并强制关闭，必须拦下交由 useDialogBehavior 叠层栈处理。
        event.preventDefault();
      }}
      onClick={(event) => {
        if (!open || justDraggedRef.current) return;
        if (event.target !== dialogRef.current) return;
        const rect = dialogRef.current.getBoundingClientRect();
        const hasLayout = rect.width > 0 || rect.height > 0;
        const clickedBackdrop =
          !hasLayout ||
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom;
        if (!clickedBackdrop) return;
        if (guardBackdrop) {
          nudge();
          return;
        }
        onClose();
      }}
      className={[
        `sn-dlg cp-modal-panel ${widthCls} [--cp-backdrop:var(--sn-overlay)]`,
        panelClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
        {hideHeader ? (
          closable ? (
            <button
              type="button"
              data-modal-close=""
              onClick={onClose}
              disabled={!open}
              data-kbd="Esc"
              className={`absolute top-4 right-4 z-20 ${CLOSE_BUTTON_CLASS}`}
              aria-label={t("common.close")}
            >
              <Icon name="x" size={16} />
            </button>
          ) : null
        ) : (
          // 头部使用 Satin `.sn-hd`（支持按住拖拽与双击复位），头尾不画硬分隔线。
          <div className="sn-hd flex shrink-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {snapshot.icon ? <DialogIcon tone={tone}>{snapshot.icon}</DialogIcon> : null}
              <div className={["min-w-0", snapshot.icon ? "pt-px" : "pt-0.5"].join(" ")}>
                <h2
                  className={[
                    "flex min-w-0 items-center gap-2 font-semibold tracking-tight text-ink",
                    snapshot.icon ? "text-base" : "text-lg",
                  ].join(" ")}
                >
                  <span id={titleId} className="min-w-0 truncate">
                    {snapshot.title}
                  </span>
                  {snapshot.titleAccessory ? (
                    <span className="shrink-0" aria-hidden="true">
                      {snapshot.titleAccessory}
                    </span>
                  ) : null}
                </h2>
                {snapshot.description ? (
                  <div id={descriptionId} className="mt-0.5 text-sm leading-relaxed text-ink-2">
                    {snapshot.description}
                  </div>
                ) : null}
              </div>
            </div>
            {closable ? (
              <button
                type="button"
                data-modal-close=""
                onClick={onClose}
                disabled={!open}
                data-kbd="Esc"
                className={CLOSE_BUTTON_CLASS}
                aria-label={t("common.close")}
              >
                <Icon name="x" size={16} />
              </button>
            ) : null}
          </div>
        )}

        <div
          ref={fade.ref}
          data-testid={bodyTestId}
          className={[
            "min-h-0",
            bodyHeightCls,
            bodyOverflowCls,
            "overscroll-contain px-5",
            hideHeader ? "pt-5" : "pt-3.5",
            snapshot.footer ? "pb-2" : "pb-5",
            bodyClassName ?? "",
          ].join(" ")}
        >
          {snapshot.children}
        </div>

        {snapshot.footer ? (
          <div
            className={[
              "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5",
              snapshot.footerStart ? "justify-between" : "justify-end",
            ].join(" ")}
          >
            {snapshot.footerStart ? (
              <div className="min-w-0 flex-1 text-xs text-ink-3">{snapshot.footerStart}</div>
            ) : null}
            {/* 手机上按钮平分一整行，拇指好按；桌面恢复按内容宽度靠右。没有左侧辅助信息时
                占满整行，调用方自己写的「左删除、右保存」两端布局也能撑开。 */}
            <div
              className={[
                "flex flex-wrap items-center justify-end gap-2 max-sm:w-full max-sm:[&>button]:flex-1",
                snapshot.footerStart ? "ml-auto" : "w-full",
              ].join(" ")}
            >
              {snapshot.footer}
            </div>
          </div>
        ) : null}
      </div>

      {/* Top Layer 浮层专属宿主：供弹窗内所有 Select / Dropdown / DatePicker / Tooltip 安全挂载 */}
      <div ref={portalHostRef} data-modal-portal-host="" data-dismiss-safe="" />
    </dialog>,
    document.body,
  );
}
