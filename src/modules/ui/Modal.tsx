import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";

const ANIMATION_MS = 180;

export function Modal({
  open,
  title,
  description,
  footer,
  maxWidth = "max-w-3xl",
  panelClassName,
  bodyHeightClassName,
  bodyClassName,
  bodyTestId,
  hideHeader = false,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  maxWidth?: string;
  panelClassName?: string;
  bodyHeightClassName?: string;
  bodyClassName?: string;
  bodyTestId?: string;
  hideHeader?: boolean;
  onClose: () => void;
}>) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);
  const timeoutRef = useRef<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setMounted(true);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
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

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          onClose();
        }}
        aria-label="close"
        className={[
          "absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm dark:bg-black/50",
          "transition-opacity duration-200 ease-out motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        className={[
          `relative z-10 w-full ${maxWidth} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950`,
          "transition-all duration-200 ease-out motion-reduce:transition-none",
          visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95",
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
              <h2 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                <span id={titleId}>{title}</span>
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-white/65">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={!open}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-500 shadow-none transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="close"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div
          data-testid={bodyTestId}
          className={`${bodyHeightCls} overflow-y-auto overscroll-contain px-5 py-4 ${bodyClassName ?? ""}`}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-neutral-800">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
