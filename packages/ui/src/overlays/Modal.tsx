import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

/** Exit animation duration — keep content mounted until this finishes. */
const ANIMATION_MS = 220;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

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
    }, ANIMATION_MS);

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
    transitionDuration: `${ANIMATION_MS}ms`,
    transitionTimingFunction: EASE,
  } as const;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          onClose();
        }}
        aria-label="close"
        style={transitionStyle}
        className={[
          "absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/50",
          "transition-opacity motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? snapshot.title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        style={transitionStyle}
        className={[
          `relative z-10 w-full ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950`,
          // Animate opacity + subtle rise only — avoid scale that makes height feel like it collapses.
          "transition-[opacity,transform] will-change-transform motion-reduce:transition-none motion-reduce:transform-none",
          visible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-3",
          panelClassName,
        ].join(" ")}
      >
        {hideHeader ? (
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            className="absolute top-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="close"
          >
            <X size={16} />
          </button>
        ) : (
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-neutral-800">
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
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="close"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div
          data-testid={bodyTestId}
          className={`${bodyHeightCls} ${bodyOverflowCls} overscroll-contain px-5 py-4 ${bodyClassName ?? ""}`}
        >
          {snapshot.children}
        </div>

        {snapshot.footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-neutral-800">
            {snapshot.footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
