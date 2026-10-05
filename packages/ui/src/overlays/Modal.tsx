import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useId, useRef, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";
import { overlayBackdropMotion, overlayPanelMotion, useOverlayPresence } from "./overlayMotion";

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
  const { mounted, visible } = useOverlayPresence(open);
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
  // 遮罩与面板分层：进场一起出现，面板多走一段落稳；退场面板先走，遮罩随后褪去。
  const backdropMotion = overlayBackdropMotion(visible);
  const panelMotion = overlayPanelMotion(visible, !open);

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
        style={backdropMotion.style}
        className={[
          // 只压暗、不模糊：模糊会把背后的页面整片糊掉，打开一个小确认框也像换了个场景。
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          backdropMotion.className,
        ].join(" ")}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? snapshot.title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        style={panelMotion.style}
        className={[
          `relative z-10 w-full ${maxWidth} overflow-hidden rounded-3xl bg-elevated text-ink shadow-dialog`,
          panelMotion.className,
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
