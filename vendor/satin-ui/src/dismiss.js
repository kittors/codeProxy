// 统一轻量浮层出现与消失协调器（Select / InlineMenu / Popover / FloatMenu / Picker / ColorPopover / Drawer / Cmdk）。
// 原则：
// 1. 精准内外命中：基于 composedPath() 只认真实交互面（面板与触发器本身），绝不把布局容器空白误判为弹窗内部；
// 2. 捕获阶段拦截：pointerdown / keydown(Escape) / focusin 均走 capture，不被滚动条、画布、表格等子组件的 stopPropagation 吞掉；
// 3. 完整父子层级：打开子浮层（如主题面板里的取色器、抽屉里的下拉选择）不误关祖先；点击子浮层内不误关祖先；按 Esc 严格后进先出逐层关闭；
// 4. 窗口失焦同步收起：在 iframe 演示或切换窗口时，非模态浮层自动优雅收起，不孤零零悬空；
// 5. 零闲置开销与零泄漏：只在栈非空时挂载 4 个全局监听（经 isolated track 隔离，不污染单个组件生命周期），栈空立刻卸载。
import { track } from "./lifecycle.js";

const stack = [];
let disposeGlobal = null;

const has = (a, b) => !!(a && b && (a === b || a.contains?.(b)));

// 精准判断节点或事件路径是否落在给定交互元素集合内（兼容 Shadow DOM 与同步 DOM 变更）
export function hitAny(target, path, els) {
  if (!els?.length) return false;
  for (const el of els) if (el && (path?.length ? path.includes(el) : has(el, target))) return true;
  return false;
}

// 判断 parent 是否为 child 的逻辑祖先（DOM 包含或经过浮层链间接包含）
function isAncestor(parent, child, seen = new Set()) {
  if (!parent || !child || parent === child || seen.has(parent)) return false;
  seen.add(parent);
  const p = parent.panel;
  if (p && (has(p, child.trigger) || has(p, child.panel))) return true;
  for (const mid of stack) {
    if (mid !== parent && mid !== child && mid.panel && (has(mid.panel, child.trigger) || has(mid.panel, child.panel)) && isAncestor(parent, mid, seen)) return true;
  }
  return false;
}

function keepAncestors(entry, keep) {
  keep.add(entry);
  for (const other of stack) if (!keep.has(other) && isAncestor(other, entry)) keepAncestors(other, keep);
}

function dismissOutside(e, isFocus) {
  if (!stack.length) return;
  const target = e.target;
  if (isFocus && (!target || target === document || target === window)) return;
  const path = e.composedPath?.() || null, keep = new Set();
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i];
    if (!keep.has(entry) && (entry.contains?.(target, path) || entry.ignore?.(target, path))) keepAncestors(entry, keep);
  }
  for (const entry of [...stack].reverse()) {
    if ((!isFocus || entry.focusOut !== false) && !keep.has(entry) && stack.includes(entry)) entry.close(false);
  }
}

const onPointerDown = (e) => dismissOutside(e, false);
const onFocusIn = (e) => dismissOutside(e, true);

function onKeyDown(e) {
  if (e.key !== "Escape" || !stack.length) return;
  const top = stack.at(-1);
  if (!top) return;
  e.preventDefault(); e.stopPropagation(); top.close(true);
}

function onWindowBlur() {
  if (!stack.length) return;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  for (const entry of [...stack].reverse()) {
    if (!stack.includes(entry)) continue;
    if (typeof entry.blur === "function" ? !entry.blur() : entry.blur === false) continue;
    if (active?.tagName === "IFRAME" && has(entry.panel, active)) continue;
    entry.close(false);
  }
}

function attachGlobal() {
  if (disposeGlobal || typeof document === "undefined") return;
  const [, dispose] = track(() => {
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    if (typeof window !== "undefined") window.addEventListener("blur", onWindowBlur);
  }, { isolate: true });
  disposeGlobal = dispose;
}

function detachGlobal() {
  if (!disposeGlobal || stack.length > 0) return;
  const d = disposeGlobal;
  disposeGlobal = null;
  d();
}

export function pushDismiss(entry) {
  if (!entry) return entry;
  // 同类/平级互斥：关闭所有非模态且不是当前浮层祖先的已打开浮层
  if (entry.exclusive !== false) {
    for (const other of [...stack].reverse()) {
      if (other === entry || other.modal || !stack.includes(other)) continue;
      if (isAncestor(other, entry)) continue;
      other.close(false);
    }
  }
  const idx = stack.indexOf(entry);
  if (idx >= 0) stack.splice(idx, 1);
  stack.push(entry);
  attachGlobal();
  return entry;
}

export function dropDismiss(entry) {
  const idx = stack.indexOf(entry);
  if (idx >= 0) stack.splice(idx, 1);
  if (!stack.length) detachGlobal();
}

export function findDismiss(pred) {
  return stack.find(pred);
}
