import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useScrollFade } from "../hooks/useScrollFade";
import { DialogIcon, type DialogTone } from "./DialogIcon";
import { overlayBackdropMotion, overlayPanelMotion, useOverlayPresence } from "./overlayMotion";
import {
  useDialogBehavior,
  useInteractionGuard,
  type DialogInitialFocus,
} from "./useDialogBehavior";

/** 关闭按钮：无底色圆形，悬停才出现浅灰叠层。 */
const CLOSE_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-ink-3 shadow-none transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-60";

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
   * Esc 和点遮罩只会让面板轻晃。由调用方在流程结束后自己把 open 置为 false。
   */
  closable?: boolean;
  /** 关闭被拦下时（不可关闭、或有未保存修改时按了 Esc / 点了遮罩）通知调用方，例如亮出原因。 */
  onBlockedClose?: () => void;
  /**
   * 有未保存的修改。不传时自动判断：在弹窗里输入过文字后，点遮罩不再关闭（面板轻晃提示）。
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
  const { mounted, visible } = useOverlayPresence(open);
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [nudging, setNudging] = useState(false);
  const { interacted, onInput } = useInteractionGuard(open);
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

  const nudge = useCallback(() => {
    setNudging(false);
    // 下一帧再加回类名，连续点击也能重新播放。
    window.requestAnimationFrame(() => setNudging(true));
    onBlockedClose?.();
  }, [onBlockedClose]);

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
    panelRef,
    onEscape: handleEscape,
    onSubmitShortcut,
    initialFocus,
  });

  // 内容溢出时上下渐隐，代替以前滚动后浮出的头尾分隔线：没有硬边，也看得出「还能往下滚」。
  const fade = useScrollFade<HTMLDivElement>({ enabled: mounted });

  if (!mounted) return null;

  const bodyHeightCls = bodyHeightClassName ?? "max-h-[70vh]";
  const bodyOverflowCls = bodyOverflowClassName ?? "overflow-y-auto";
  const widthCls = maxWidth ?? SIZE_CLASS[size ?? "lg"];
  // 遮罩与面板分层：进场一起出现，面板多走一段落稳；退场面板先走，遮罩随后褪去。
  const backdropMotion = overlayBackdropMotion(visible);
  const panelMotion = overlayPanelMotion(visible, !open);
  const hasDescription = Boolean(snapshot.description) && !hideHeader;

  return createPortal(
    // 手机上是底部弹出的面板（贴底、上圆角，拇指够得着按钮）；sm 以上居中。
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4">
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={hideHeader ? snapshot.title : undefined}
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        tabIndex={-1}
        onInput={onInput}
        onAnimationEnd={(event) => {
          if (event.animationName === "overlay-nudge") setNudging(false);
        }}
        style={panelMotion.style}
        className={[
          `relative z-10 flex max-h-[calc(100dvh-0.5rem)] w-full ${widthCls} flex-col overflow-hidden rounded-t-3xl bg-elevated text-ink shadow-dialog outline-none [--cp-backdrop:var(--cp-elevated)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl`,
          panelMotion.className,
          nudging ? "overlay-nudge" : "",
          panelClassName,
        ].join(" ")}
      >
        {hideHeader ? (
          closable ? (
            <button
              type="button"
              onClick={onClose}
              disabled={!open}
              className={`absolute top-4 right-4 z-20 ${CLOSE_BUTTON_CLASS}`}
              aria-label={t("common.close")}
            >
              <X size={18} />
            </button>
          ) : null
        ) : (
          // 头部、尾部不画分隔线：留白把三段分开，内容滚动时由正文区的上下渐隐过渡。
          <div className="flex shrink-0 items-start justify-between gap-3 pt-5 pr-4 pb-1 pl-6">
            <div className="flex min-w-0 flex-1 items-start gap-3.5">
              {snapshot.icon ? <DialogIcon tone={tone}>{snapshot.icon}</DialogIcon> : null}
              <div className={["min-w-0", snapshot.icon ? "pt-px" : "pt-1"].join(" ")}>
                <h2
                  className={[
                    "flex min-w-0 items-center gap-2 font-semibold tracking-tight text-ink",
                    snapshot.icon ? "text-lg" : "text-xl",
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
                onClick={onClose}
                disabled={!open}
                className={CLOSE_BUTTON_CLASS}
                aria-label={t("common.close")}
              >
                <X size={18} />
              </button>
            ) : null}
          </div>
        )}

        <div
          ref={fade.ref}
          onScroll={fade.onScroll}
          style={fade.style}
          data-testid={bodyTestId}
          className={[
            "min-h-0",
            bodyHeightCls,
            bodyOverflowCls,
            "overscroll-contain px-6",
            hideHeader ? "pt-6" : "pt-4",
            snapshot.footer ? "pb-2" : "pb-6",
            fade.className,
            bodyClassName ?? "",
          ].join(" ")}
        >
          {snapshot.children}
        </div>

        {snapshot.footer ? (
          <div
            className={[
              "flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6",
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
                "flex flex-wrap items-center justify-end gap-2.5 max-sm:w-full max-sm:[&>button]:flex-1",
                snapshot.footerStart ? "ml-auto" : "w-full",
              ].join(" ")}
            >
              {snapshot.footer}
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
