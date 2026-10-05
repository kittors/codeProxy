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
    // 桌面端抽屉离屏幕边缘留 8px，四角圆起来，读起来是浮在页面上的一张面板而不是一块切出来的墙；
    // 手机上贴边铺满，省下边距。
    <div className="fixed inset-0 z-[200] flex justify-end sm:p-2">
      <button
        type="button"
        onClick={() => {
          if (!open) return;
          onClose();
        }}
        aria-label={t("common.close")}
        className={[
          // 与 Modal 用同一套遮罩语言：只压暗、不模糊。
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          "transition-opacity duration-250 ease-soft motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={[
          `relative z-10 flex h-full ${widthClassName} flex-col overflow-hidden bg-elevated text-ink shadow-dialog sm:max-w-[calc(100vw-1rem)] sm:rounded-3xl`,
          "transition-transform duration-250 ease-soft motion-reduce:transition-none",
          // 收起时多推出 1rem，把面板和屏幕边缘之间的间距也一起带走，不会留一条阴影。
          visible ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
        ].join(" ")}
      >
        {/* 抽屉内容通常很长，头尾保留一条细分隔线，滚动时内容不会和标题、按钮粘在一起。 */}
        <div className="flex items-start justify-between gap-3 border-b border-line py-4 pr-4 pl-6">
          <div className="min-w-0 pt-1">
            <h2 id={titleId} className="truncate text-lg font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!open}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-3 shadow-none transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 ${bodyClassName ?? ""}`}>
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-line px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
