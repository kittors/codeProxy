import { isValidElement, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getToasts, setToastDismissLabel, subscribeToasts } from "./toastStore";

/**
 * Satin 原生 Toast 桥接宿主：
 * 所有 Toast 队列、Top Layer 置顶、倒计时圆环、同文案 `×N` 合并、手势轻扫、原地宽度变形与
 * 3D 移动端叠牌均由 `satin-ui` 原生 `toast()` 引擎直接驱动；本组件仅负责：
 * 1) 向 Satin 引擎同步当前语言的关闭按钮无障碍标签；
 * 2) 当业务方传入非字符串 JSX `description` 时，通过 Portal 挂入 Satin 原生 `.sn-toast-desc` 插槽。
 */
export function Toaster() {
  const { t } = useTranslation();
  const records = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const dismissLabel = t("common.dismiss_notification", {
    defaultValue: "Dismiss notification",
  });

  useEffect(() => {
    setToastDismissLabel(dismissLabel);
  }, [dismissLabel]);

  const portalNodes = records
    .filter(
      (record) =>
        record.descEl &&
        record.description !== undefined &&
        record.description !== null &&
        typeof record.description !== "string" &&
        typeof record.description !== "number" &&
        (isValidElement(record.description) || Array.isArray(record.description)),
    )
    .map((record) => createPortal(record.description, record.descEl!, String(record.id)));

  return portalNodes.length > 0 ? <>{portalNodes}</> : null;
}
