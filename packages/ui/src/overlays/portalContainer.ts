/** 弹窗进入 Top Layer 时广播的事件名，供全局 Toaster 等顶层 Popover 重新置顶。 */
export const TOP_LAYER_DIALOG_OPEN_EVENT = "satin-dialog-open";

let cachedNativePopoverSupport: boolean | null = null;

/**
 * 检测当前环境是否原生支持 HTML Popover API（含 `:popover-open` 选择器）。
 * 真实现代浏览器返回 true，jsdom 等缺少 `:popover-open` 实现的测试环境返回 false，
 * 避免给宿主打上 `popover="manual"` 后被无障碍查询工具误判为隐藏不可见。
 */
export function supportsNativePopover(): boolean {
  if (cachedNativePopoverSupport !== null) return cachedNativePopoverSupport;
  if (
    typeof document === "undefined" ||
    typeof HTMLElement === "undefined" ||
    !("popover" in HTMLElement.prototype) ||
    typeof HTMLElement.prototype.showPopover !== "function"
  ) {
    cachedNativePopoverSupport = false;
    return false;
  }
  try {
    const probe = document.createElement("div");
    probe.matches(":popover-open");
    cachedNativePopoverSupport = true;
  } catch {
    cachedNativePopoverSupport = false;
  }
  return cachedNativePopoverSupport;
}

/**
 * 解析浮层 Portal 的安全挂载宿主（Top Layer 兼容）：
 *
 * 原生 `<dialog class="sn-dlg">` 通过 `showModal()` 进入浏览器 Top Layer 后：
 * 1) 挂在 `document.body` 的普通 `fixed` 浮层会被 `<dialog>` 盖在下面且被 modal inert 屏蔽交互；
 * 2) 若直接挂进 `<dialog>` 且 `<dialog>` 因拖拽设置了 `translate`，`position: fixed` 子元素会相对弹窗偏移。
 *
 * 因此每个 `<Modal>` 都在 `<dialog>` 内部提供一个 `[data-modal-portal-host]` 透明宿主（真实浏览器中启用
 * `popover="manual"` + `showPopover()`）：它位于 `<dialog>` 子树内故非 inert，同时处于 Top Layer 弹窗之上、
 * 包含块强制为视口，彻底避免遮挡与拖拽偏移。未在 `<dialog>` 内时回退到 `document.body`。
 */
export function resolvePortalContainer(anchor?: Element | null): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("resolvePortalContainer requires a browser DOM environment");
  }
  const hostDialog = anchor?.closest?.("dialog[open]");
  if (hostDialog instanceof HTMLElement) {
    const portalHost = hostDialog.querySelector<HTMLElement>(":scope > [data-modal-portal-host]");
    return portalHost ?? hostDialog;
  }
  return document.body;
}

/** 安全地将元素配置为 `popover="manual"` 并推入 Top Layer 顶层（仅在原生支持 Popover API 时生效）。 */
export function showTopLayerPopover(element: HTMLElement | null | undefined): void {
  if (!element || !supportsNativePopover()) return;
  try {
    if (element.getAttribute("popover") !== "manual") {
      element.setAttribute("popover", "manual");
    }
    element.showPopover();
  } catch {
    // 已处于 :popover-open 或节点尚未连接文档时静默忽略。
  }
}

/** 安全地关闭 `popover="manual"` 元素（仅在原生支持 Popover API 时生效）。 */
export function hideTopLayerPopover(element: HTMLElement | null | undefined): void {
  if (!element || !supportsNativePopover()) return;
  try {
    if (element.matches(":popover-open")) {
      element.hidePopover();
    }
  } catch {
    // 尚未打开或已卸载时静默忽略。
  }
}

/** 通知全局 Top Layer 通知条等元素重新置顶，确保压在新打开的原生 `<dialog>` 之上。 */
export function notifyTopLayerDialogOpened(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOP_LAYER_DIALOG_OPEN_EVENT));
}
