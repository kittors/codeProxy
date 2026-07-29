import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

const ANIMATION_MS = 200;

export function Drawer({
  open,
  title,
  description,
  footer,
  widthClassName = "w-[min(720px,100vw)]",
  bodyClassName,
  onClose,
  children,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  bodyClassName?: string;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
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
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
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
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          onClose();
        }}
        aria-label={t("common.close")}
        className={[
          "absolute inset-0 cursor-default bg-slate-950/45 dark:bg-black/60",
          // 与 Modal 用同一套遮罩语言：模糊度随淡入一起上，不是一开始就糊。
          "transition-[opacity,backdrop-filter] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          visible ? "opacity-100 backdrop-blur-md" : "opacity-0 backdrop-blur-none",
        ].join(" ")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          `relative z-10 flex h-full ${widthClassName} flex-col bg-white shadow-[-24px_0_60px_-24px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/10 dark:bg-[#0E0E12] dark:ring-white/10 dark:shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.8)]`,
          "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          visible ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-900/8 px-6 py-4 dark:border-white/8">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-white/65">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            className="group inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 shadow-none transition-colors hover:bg-slate-900/5 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t("common.close")}
          >
            <X size={16} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 ${bodyClassName ?? ""}`}>
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-900/8 px-5 py-4 dark:border-white/8">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
