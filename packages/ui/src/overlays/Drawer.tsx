import { createPortal } from "react-dom";
import { useEffect, useId, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { drawerPanelMotion, overlayBackdropMotion, useOverlayPresence } from "./overlayMotion";

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
  // 与弹窗共用进出场：隔两帧再置为可见，进场滑入才有起点（以前只隔一帧，常常直接跳出来）。
  const { mounted, visible } = useOverlayPresence(open);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!mounted) return null;

  const backdropMotion = overlayBackdropMotion(visible);
  const panelMotion = drawerPanelMotion(visible);

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
        style={backdropMotion.style}
        className={[
          // 与 Modal 用同一套遮罩语言：只压暗、不模糊。
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          backdropMotion.className,
        ].join(" ")}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={panelMotion.style}
        className={[
          `relative z-10 flex h-full ${widthClassName} flex-col overflow-hidden bg-elevated text-ink shadow-dialog sm:max-w-[calc(100vw-1rem)] sm:rounded-3xl`,
          panelMotion.className,
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
