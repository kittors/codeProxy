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
import { cssEase, EASE_IN, EASE_OUT, OVERLAY_ENTER_MS, OVERLAY_EXIT_MS } from "../utils/motion";

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
          "absolute inset-0 cursor-default bg-slate-950/45 dark:bg-black/60",
          "transition-[opacity,backdrop-filter] motion-reduce:transition-none",
          visible ? "opacity-100 backdrop-blur-md" : "opacity-0 backdrop-blur-none",
        ].join(" ")}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? snapshot.title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        style={transitionStyle}
        className={[
          `relative z-10 w-full ${maxWidth} overflow-hidden rounded-3xl bg-white ring-1 ring-slate-900/10 shadow-[0_32px_80px_-24px_rgba(15,23,42,0.45)] dark:bg-[#0E0E12] dark:ring-white/10 dark:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.8)]`,
          // 放大幅度压到 0.97：再大就会让面板高度看着像「塌下去又弹起来」。
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
            className="group absolute top-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none transition-colors hover:bg-slate-900/5 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t("common.close")}
          >
            <X
              size={16}
              className="transition-transform duration-200 motion-safe:group-hover:rotate-90"
            />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3 border-b border-slate-900/8 px-6 py-4 dark:border-white/8">
            <div className="min-w-0">
              <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight text-slate-900 dark:text-white">
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
                <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
                  {snapshot.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!open}
              className="group inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none transition-colors hover:bg-slate-900/5 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={t("common.close")}
            >
              <X
                size={16}
                className="transition-transform duration-200 motion-safe:group-hover:rotate-90"
              />
            </button>
          </div>
        )}

        <div
          data-testid={bodyTestId}
          className={`${bodyHeightCls} ${bodyOverflowCls} overscroll-contain px-6 py-5 ${bodyClassName ?? ""}`}
        >
          {snapshot.children}
        </div>

        {snapshot.footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-900/8 px-6 py-4 dark:border-white/8">
            {snapshot.footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
