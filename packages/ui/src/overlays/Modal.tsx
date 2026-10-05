import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import {
  cssEase,
  EASE_IN,
  EASE_OUT,
  EASE_SPRING,
  OVERLAY_ENTER_MS,
  OVERLAY_EXIT_MS,
  OVERLAY_TRANSFORM_ENTER_MS,
} from "../utils/motion";

/** 关闭按钮：无底色圆形，悬停才出现浅灰叠层。 */
const CLOSE_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-3 shadow-none transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";

export function Modal({
  open,
  title,
  titleAccessory,
  description,
  footer,
  maxWidth = "max-w-3xl",
  panelClassName,
  bodyHeightClassName,
  bodyOverflowClassName,
  bodyClassName,
  bodyTestId,
  hideHeader = false,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  titleAccessory?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
  panelClassName?: string;
  bodyHeightClassName?: string;
  bodyOverflowClassName?: string;
  bodyClassName?: string;
  bodyTestId?: string;
  hideHeader?: boolean;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const timeoutRef = useRef<number | null>(null);
  const titleId = useId();
  // Snapshot title/description/footer/children while open so parents can clear
  // props immediately without collapsing the panel mid-exit animation.
  const contentRef = useRef({
    title,
    titleAccessory,
    description,
    footer,
    children,
  });
  if (open) {
    contentRef.current = {
      title,
      titleAccessory,
      description,
      footer,
      children,
    };
  }
  const snapshot = contentRef.current;

  useEffect(() => {
    if (open) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setMounted(true);
      // Double rAF ensures the browser paints the "hidden" frame before animating in.
      let raf2 = 0;
      const raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        window.cancelAnimationFrame(raf1);
        if (raf2) window.cancelAnimationFrame(raf2);
      };
    }

    setVisible(false);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      setMounted(false);
      timeoutRef.current = null;
    }, OVERLAY_EXIT_MS);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!mounted) return null;

  const bodyHeightCls = bodyHeightClassName ?? "max-h-[70vh]";
  const bodyOverflowCls = bodyOverflowClassName ?? "overflow-y-auto";
  const transitionStyle = {
    transitionDuration: `${visible ? OVERLAY_ENTER_MS : OVERLAY_EXIT_MS}ms`,
    transitionTimingFunction: cssEase(visible ? EASE_OUT : EASE_IN),
  } as const;
  // 面板的 transition-property 顺序是 [opacity, transform]：进场时淡入走减速曲线，
  // 位移/缩放走更长的轻回弹，像被轻轻放到桌面上；退场两者一起快速收走。
  const panelTransitionStyle = visible
    ? {
        transitionDuration: `${OVERLAY_ENTER_MS}ms, ${OVERLAY_TRANSFORM_ENTER_MS}ms`,
        transitionTimingFunction: `${cssEase(EASE_OUT)}, ${cssEase(EASE_SPRING)}`,
      }
    : transitionStyle;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          onClose();
        }}
        aria-hidden="true"
        tabIndex={-1}
        style={transitionStyle}
        className={[
          // 只压暗、不模糊：模糊会把背后的页面整片糊掉，打开一个小确认框也像换了个场景。
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          "transition-opacity motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? snapshot.title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        style={panelTransitionStyle}
        className={[
          `relative z-10 w-full ${maxWidth} overflow-hidden rounded-3xl bg-elevated text-ink shadow-dialog`,
          // 放大幅度压到 0.97：再大就会让面板高度看着像「塌下去又弹起来」。
          // 回弹曲线只越过一点点，配合 0.97 起点，落位是「稳住」而不是「弹跳」。
          "transition-[opacity,transform] will-change-transform motion-reduce:transition-none motion-reduce:transform-none",
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.97]",
          panelClassName,
        ].join(" ")}
      >
        {hideHeader ? (
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            className={`absolute top-4 right-4 z-20 ${CLOSE_BUTTON_CLASS}`}
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        ) : (
          // 头部、尾部不画分隔线：留白已经把三段分开，线只会让弹窗显得像表格。
          <div className="flex items-start justify-between gap-3 pt-5 pr-4 pb-1 pl-6">
            <div className="min-w-0 pt-1">
              <h2 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight text-ink">
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
                <p className="mt-1 text-sm text-ink-2">
                  {snapshot.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!open}
              className={CLOSE_BUTTON_CLASS}
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div
          data-testid={bodyTestId}
          className={[
            bodyHeightCls,
            bodyOverflowCls,
            "overscroll-contain px-6",
            hideHeader ? "pt-6" : "pt-4",
            snapshot.footer ? "pb-2" : "pb-6",
            bodyClassName ?? "",
          ].join(" ")}
        >
          {snapshot.children}
        </div>

        {snapshot.footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 pt-4 pb-6">
            {snapshot.footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
