import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  updateToast,
  type ToastRecord,
  type ToastType,
} from "./toastStore";

/** 撤销成功后的确认提示停留多久。 */
const SUCCESS_LABEL_DURATION_MS = 1800;

/**
 * 最新 Satin 液态毛玻璃胶囊 Toast 语义映射：
 * 配合 `satin-ui/css/feedback.css` 的 `.sn-toast > .sn-toast-in` 与 `.sn-ico[data-tone]`
 * 在浅色下呈现通透亮白毛玻璃胶囊、深色下呈现深邃炭黑毛玻璃胶囊。
 */
const STATUS_META: Record<
  Exclude<ToastType, "default">,
  { icon: string; dataTone: string; toneClass: string }
> = {
  success: { icon: "circle-check", dataTone: "ok", toneClass: "sn-ok" },
  error: { icon: "circle-alert", dataTone: "danger", toneClass: "sn-danger" },
  warning: { icon: "triangle-alert", dataTone: "warn", toneClass: "sn-warn" },
  info: { icon: "info", dataTone: "info", toneClass: "sn-info" },
};

/**
 * 顶部居中的 Satin 提示条：
 * - 严格使用 `.sn-toast > .sn-toast-in` 标准结构，自动享有液态毛玻璃材质、圆形语义图标与 `.sn-act` 撤销胶囊；
 * - 鼠标悬停在任意一条上时全部暂停倒计时，移开后继续剩余时长；
 * - 单行轻提示保持紧凑胶囊，带详细描述时自动切换圆角多行卡片并支持清晰换行与滚动。
 */
export function Toaster() {
  const { t } = useTranslation();
  const records = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const [paused, setPaused] = useState(false);

  return (
    <section
      aria-label={t("common.notifications", { defaultValue: "Notifications" })}
      className="pointer-events-none fixed inset-x-0 top-5 z-[10020] flex justify-center px-4"
    >
      <ol className="flex w-full flex-col items-center gap-2">
        {[...records].reverse().map((record) => (
          <ToastItem
            key={record.id}
            record={record}
            paused={paused}
            onHoverChange={setPaused}
          />
        ))}
      </ol>
    </section>
  );
}

function ToastItem({
  record,
  paused,
  onHoverChange,
}: {
  record: ToastRecord;
  paused: boolean;
  onHoverChange: (hovering: boolean) => void;
}) {
  const { t } = useTranslation();
  const remainingRef = useRef(record.duration);
  const startedAtRef = useRef(0);

  // 内容被替换（同 id 再次触发、撤销后换成确认提示）时重新计时。
  useEffect(() => {
    remainingRef.current = record.duration;
  }, [record.revision, record.duration]);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => dismissToast(record.id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      );
    };
  }, [paused, record.id, record.revision]);

  const handleAction = () => {
    const action = record.action;
    if (!action) return;
    action.onClick();
    if (action.successLabel) {
      updateToast(record.id, {
        type: "success",
        title: action.successLabel,
        description: undefined,
        action: undefined,
        duration: SUCCESS_LABEL_DURATION_MS,
      });
    } else {
      dismissToast(record.id);
    }
  };

  const hasDescription =
    record.description !== undefined && record.description !== null && record.description !== "";
  const status = record.type === "default" ? null : STATUS_META[record.type];

  return (
    <li
      role={record.type === "error" ? "alert" : "status"}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      className="sn-toast sn-toast-flow pointer-events-auto max-w-[min(calc(100vw-2rem),42rem)]"
    >
      <div
        className={[
          "sn-toast-in",
          hasDescription ? "sn-toast-multiline" : "",
          record.action ? "sn-has-act" : "",
          record.type === "success" ? "sn-shine" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {status ? (
          <span
            className={["sn-ico", hasDescription ? "mt-0.5" : ""].filter(Boolean).join(" ")}
            data-tone={status.dataTone}
          >
            <span className={`sn-glyph ${status.toneClass}`}>
              <Icon name={status.icon} size={14} />
            </span>
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p
            className={[
              "max-w-[min(calc(100vw-9rem),34rem)] text-sm leading-5 font-medium",
              hasDescription ? "break-words" : "truncate",
            ].join(" ")}
          >
            {record.title}
          </p>
          {hasDescription ? (
            <div className="mt-1 max-h-40 overflow-y-auto text-xs leading-5 break-words whitespace-pre-line text-[var(--sn-label2)] [overflow-wrap:anywhere]">
              {record.description}
            </div>
          ) : null}
        </div>
        {record.action ? (
          <button type="button" onClick={handleAction} className="sn-act">
            {record.action.label}
          </button>
        ) : null}
        {hasDescription ? (
          // 使用通知专属无障碍标签，避免读屏把提示条关闭按钮与页面弹窗的 Close 按钮混淆。
          <button
            type="button"
            onClick={() => dismissToast(record.id)}
            aria-label={t("common.dismiss_notification", { defaultValue: "Dismiss notification" })}
            className="sn-btn sn-ghost sn-xs sn-ibtn sn-round -mr-1 shrink-0 text-[var(--sn-label3)]"
          >
            <Icon name="x" size={13} />
          </button>
        ) : null}
      </div>
    </li>
  );
}
