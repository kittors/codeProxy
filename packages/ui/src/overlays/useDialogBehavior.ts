import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * 打开中的弹窗 / 抽屉，按打开顺序排列。
 *
 * 嵌套时（编辑弹窗里再弹一个确认框）Esc、Tab 循环、快捷键只该由最上层处理——以前每层
 * 各自在 window 上监听 Esc，按一下就把两层一起关掉，外层表单里填的内容也跟着丢了。
 */
const overlayStack: symbol[] = [];

function pushOverlay(id: symbol): () => void {
  overlayStack.push(id);
  return () => {
    const index = overlayStack.lastIndexOf(id);
    if (index >= 0) overlayStack.splice(index, 1);
  };
}

export function isTopOverlay(id: symbol): boolean {
  return overlayStack[overlayStack.length - 1] === id;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/** 打开时优先聚焦的「可以直接填写」的控件；只读、禁用、隐藏的跳过。 */
const FIRST_FIELD = [
  "[data-autofocus]",
  "input:not([disabled]):not([readonly]):not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file'])",
  "textarea:not([disabled]):not([readonly])",
].join(",");

function isVisible(element: HTMLElement): boolean {
  // jsdom 里没有布局，offsetParent 永远是 null；只在真实浏览器里按可见性过滤。
  if (typeof window === "undefined" || !element.getClientRects) return true;
  if (element.getClientRects().length === 0) {
    return navigator.userAgent.includes("jsdom");
  }
  return getComputedStyle(element).visibility !== "hidden";
}

export function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.closest("[inert]") && isVisible(element),
  );
}

/** 触屏设备打开弹窗时不自动聚焦输入框：会直接弹出软键盘、把半个弹窗顶出屏幕。 */
function prefersNoAutoFocus(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export type DialogInitialFocus = "auto" | "panel" | "none";

export interface DialogBehaviorOptions {
  open: boolean;
  /** 进场动画开始（useOverlayPresence 的 visible）：这时面板已挂载，可以安全地移动焦点。 */
  visible: boolean;
  panelRef: RefObject<HTMLElement | null>;
  onEscape: () => void;
  onSubmitShortcut?: () => void;
  initialFocus?: DialogInitialFocus;
}

/**
 * 弹窗与抽屉共用的键盘与焦点行为：
 * - 叠层：只有最上层响应 Esc、Tab 与快捷键；
 * - Esc：已经被里面的下拉 / 菜单处理过（defaultPrevented）就不再关闭弹窗，
 *   否则「按 Esc 收起下拉」会连弹窗一起关掉；输入法组字中的 Esc 是取消候选词，同样忽略；
 * - 打开时把焦点放到第一个可填写的控件（或 `data-autofocus` 指定的元素），没有就放在面板上，
 *   屏幕阅读器从标题开始读；里面的组件自己 autoFocus 过的不覆盖；
 * - Tab / Shift+Tab 在面板内循环，不会跑到背后的页面；
 * - ⌘ / Ctrl + Enter 触发主操作（传了 onSubmitShortcut 时）；
 * - 关闭后焦点回到打开它的那个按钮，键盘用户不用从页面顶部重新找。
 */
export function useDialogBehavior({
  open,
  visible,
  panelRef,
  onEscape,
  onSubmitShortcut,
  initialFocus = "auto",
}: DialogBehaviorOptions) {
  const idRef = useRef<symbol>(Symbol("dialog"));
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const handlersRef = useRef({ onEscape, onSubmitShortcut });
  handlersRef.current = { onEscape, onSubmitShortcut };

  // 记下「是谁打开了我」必须赶在面板里的子组件 autoFocus 之前：渲染阶段读一次焦点。
  // 以 `<Modal open />` 直接挂载时，子组件会在同一次提交里抢走焦点，effect 里再读就晚了。
  if (open && !wasOpenRef.current && typeof document !== "undefined") {
    const active = document.activeElement;
    returnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpenRef.current = open;

  // 叠层登记用 layout effect：嵌套时外层先登记、内层后登记，Esc 的归属从第一帧起就是对的。
  useLayoutEffect(() => {
    if (!open) return;
    return pushOverlay(idRef.current);
  }, [open]);

  // 归还焦点放在 passive effect 的清理里：React 提交后会把焦点恢复到提交前的元素，
  // 在 layout 阶段 focus() 会被它立刻改回去（弹窗还没卸载、输入框还在）。
  useEffect(() => {
    if (!open) return;
    return () => {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      // 只在焦点还留在这个弹窗里（或已经掉回 body）时归还：用户关闭前已经点到别处的，不去抢。
      const panel = panelRef.current;
      const current = document.activeElement;
      const focusInside = !current || current === document.body || Boolean(panel?.contains(current));
      if (target && target.isConnected && !panel?.contains(target) && focusInside) {
        target.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);

  useEffect(() => {
    if (!open || !visible || initialFocus === "none") return;
    // 进场动画要隔两帧才算「可见」：这期间如果已经在上面又打开了一层（例如从弹窗里点开大图预览），
    // 焦点归上层管，下层不能晚到一步把它抢回来。
    if (!isTopOverlay(idRef.current)) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.contains(document.activeElement)) return;
    const field =
      initialFocus === "auto" && !prefersNoAutoFocus()
        ? Array.from(panel.querySelectorAll<HTMLElement>(FIRST_FIELD)).find(isVisible)
        : undefined;
    (field ?? panel).focus({ preventScroll: true });
  }, [initialFocus, open, panelRef, visible]);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(id)) return;
      const panel = panelRef.current;
      if (event.key === "Escape") {
        if (event.defaultPrevented || event.isComposing) return;
        event.preventDefault();
        handlersRef.current.onEscape();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        const submit = handlersRef.current.onSubmitShortcut;
        if (!submit || event.isComposing || event.defaultPrevented) return;
        event.preventDefault();
        submit();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const active = document.activeElement;
      // 焦点在面板外的浮层里（下拉列表是 portal 到 body 的）时不干预，交给浮层自己处理。
      const outside = !active || !panel.contains(active);
      if (outside && active && active !== document.body && !active.closest("[data-overlay-backdrop]")) {
        return;
      }
      const items = focusableWithin(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (outside || active === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, panelRef]);
}

/**
 * 弹窗里是否已经填写过内容。只看文字输入（input / textarea / contenteditable 的 input 事件），
 * 下拉、开关这类点一下就能改回去的控件不算——它们丢了也不心疼。
 * 用来决定点遮罩时是直接关闭，还是轻晃一下提示「用按钮关闭」。
 */
export function useInteractionGuard(open: boolean) {
  const [interacted, setInteracted] = useState(false);
  useEffect(() => {
    if (open) setInteracted(false);
  }, [open]);
  const onInput = useCallback((event: { target: EventTarget | null }) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-dismiss-safe]")) return;
    const editable =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["checkbox", "radio", "range", "file", "search"].includes(target.type)) ||
      target.isContentEditable;
    if (editable) setInteracted(true);
  }, []);
  return { interacted, onInput };
}
