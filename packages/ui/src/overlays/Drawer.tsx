import { createPortal } from "react-dom";
import { useCallback, useId, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useScrollFade } from "../hooks/useScrollFade";
import { DialogIcon, type DialogTone } from "./DialogIcon";
import { drawerPanelMotion, overlayBackdropMotion, useOverlayPresence } from "./overlayMotion";
import {
  useDialogBehavior,
  useInteractionGuard,
  type DialogInitialFocus,
} from "./useDialogBehavior";

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
  /** 与 Modal 相同：不传时输入过文字后点遮罩只轻晃；传 true 时 Esc 也拦下；传 false 时直接关闭。 */
  dirty?: boolean;
  onBlockedClose?: () => void;
  onClose: () => void;
}>) {
  const { t } = useTranslation();
  // 与弹窗共用进出场：隔两帧再置为可见，进场滑入才有起点（以前只隔一帧，常常直接跳出来）。
  const { mounted, visible } = useOverlayPresence(open);
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [nudging, setNudging] = useState(false);
  const { interacted, onInput } = useInteractionGuard(open);

  // 抽屉里多是长表单：填了一半手滑点到遮罩，不该把内容全丢掉。与 Modal 同一套规则。
  const nudge = useCallback(() => {
    setNudging(false);
    window.requestAnimationFrame(() => setNudging(true));
    onBlockedClose?.();
  }, [onBlockedClose]);
  const guardBackdrop = dirty ?? interacted;
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

  if (!mounted) return null;

  const backdropMotion = overlayBackdropMotion(visible);
  const panelMotion = drawerPanelMotion(visible);

  return createPortal(
    // 桌面端抽屉离屏幕边缘留 8px，四角圆起来，读起来是浮在页面上的一张面板而不是一块切出来的墙；
    // 手机上贴边铺满，省下边距。
    <div className="fixed inset-0 z-[200] flex justify-end sm:p-2">
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
        // 遮罩不是一个「关闭」按钮：填过内容后点它只会轻晃。与 Modal 一样对读屏和 Tab 隐藏，
        // 关闭交给头部的关闭按钮和 Esc。
        aria-hidden="true"
        tabIndex={-1}
        style={backdropMotion.style}
        className={[
          // 与 Modal 用同一套遮罩语言：只压暗、不模糊。
          "absolute inset-0 cursor-default bg-black/25 dark:bg-black/55",
          backdropMotion.className,
        ].join(" ")}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onInput={onInput}
        onAnimationEnd={(event) => {
          if (event.animationName === "overlay-nudge") setNudging(false);
        }}
        style={panelMotion.style}
        className={[
          `relative z-10 flex h-full ${widthClassName} flex-col overflow-hidden bg-elevated text-ink shadow-dialog outline-none [--cp-backdrop:var(--cp-elevated)] sm:max-w-[calc(100vw-1rem)] sm:rounded-3xl`,
          panelMotion.className,
          nudging ? "overlay-nudge" : "",
        ].join(" ")}
      >
        {/* 抽屉内容通常很长：头尾不画硬分隔线，正文滚动时上下渐隐，和 Modal 一致。 */}
        <div className="flex items-start justify-between gap-3 py-4 pr-4 pl-6">
          <div className="flex min-w-0 items-start gap-3.5">
            {icon ? <DialogIcon tone={tone}>{icon}</DialogIcon> : null}
            <div className={["min-w-0", icon ? "pt-px" : "pt-1"].join(" ")}>
              <h2 id={titleId} className="truncate text-lg font-semibold tracking-tight text-ink">
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
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-3 shadow-none transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t("common.close")}
          >
            <X size={18} />
          </button>
        </div>
        <div
          ref={fade.ref}
          onScroll={fade.onScroll}
          style={fade.style}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-3 ${fade.className} ${bodyClassName ?? ""}`}
        >
          {children}
        </div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
