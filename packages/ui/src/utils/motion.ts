/**
 * 全局动效常量（严格对齐 Satin 设计系统 `tokens.css` 权威缓动与时长）：
 *
 * - `--sn-ease-out`:        cubic-bezier(0, 0, 0.58, 1)      普通淡入、悬停、颜色过渡
 * - `--sn-ease-out-strong`: cubic-bezier(0.22, 1, 0.36, 1)   弹窗/浮层缩放与位移动效、双击复位
 * - `--sn-ease-open`:       cubic-bezier(0.32, 0.72, 0, 1)   抽屉滑入、面板展开与折叠推合
 * - `--sn-ease-overshoot`:  cubic-bezier(0.34, 1.56, 0.64, 1) 小徽章/勾选框弹性微回弹
 * - `--sn-ease-in`:         cubic-bezier(0.42, 0, 1, 1)      退场收起（干脆利落）
 *
 * 与 `styles/index.css` 的 `--ease-soft` / `--ease-pop` / `--ease-spring` 保持完全一致。
 */

/** 普通减速过渡（悬停、淡入、颜色）：对齐 `--sn-ease-out`。 */
export const EASE_OUT = [0, 0, 0.58, 1] as const;
/** 弹出物进场减速（弹窗、浮层、下拉）：对齐 `--sn-ease-out-strong`。 */
export const EASE_POP = [0.22, 1, 0.36, 1] as const;
/** 抽屉滑入与区块展开曲线：对齐 `--sn-ease-open`。 */
export const EASE_OPEN = [0.32, 0.72, 0, 1] as const;
/** 轻回弹（勾选、胶囊弹出、计数徽章）：对齐 `--sn-ease-overshoot`。 */
export const EASE_SPRING = [0.34, 1.56, 0.64, 1] as const;
/** 退场加速收起：对齐 `--sn-ease-in`。 */
export const EASE_IN = [0.42, 0, 1, 1] as const;

/** 下拉、菜单、浮层：透明度、位移 / 缩放、退场的时长（对齐 Satin `.sn-pop` / `.sn-menu`）。 */
export const POPOVER_FADE_MS = 140;
export const POPOVER_ENTER_MS = 220;
export const POPOVER_EXIT_MS = 160;

/** 弹窗：遮罩 200ms 淡入、面板透明度 140ms 淡入、缩放 300ms 落位；退场统一 180ms 同节奏收起。 */
export const OVERLAY_ENTER_MS = 140;
export const OVERLAY_BACKDROP_ENTER_MS = 200;
export const OVERLAY_TRANSFORM_ENTER_MS = 300;
export const OVERLAY_PANEL_EXIT_MS = 180;
/** 弹窗退场后卸载 DOM 的时刻（与 `dialog.sn-dlg::backdrop` 180ms 退场同步）。 */
export const OVERLAY_EXIT_MS = 180;

/** 抽屉：对齐 Satin `.sn-drawer` 320ms `var(--sn-ease-open)` 滑入、220ms `var(--sn-ease-in)` 滑出。 */
export const DRAWER_ENTER_MS = 320;
export const DRAWER_EXIT_MS = 220;

/** 弹窗/抽屉被拦下关闭时的轻顶反馈时长（对齐 Satin `overlay.js` nudge 260ms）。 */
export const OVERLAY_NUDGE_MS = 260;

/** 小控件（toast、提示条、行内展开）的时长。 */
export const CONTROL_ENTER_MS = 200;

/** 悬停/按压的弹簧参数（保留供已有页面表单/卡片物理反馈使用）。 */
export const PRESS_SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

export const cssEase = (curve: readonly [number, number, number, number]): string =>
  `cubic-bezier(${curve.join(", ")})`;

/**
 * 保留供局部使用 framer-motion 的页面组件共用的浮层过渡，曲线已同步 Satin 权威值。
 */
export const popoverEnterTransition = {
  duration: POPOVER_ENTER_MS / 1000,
  ease: EASE_POP,
  opacity: { duration: POPOVER_FADE_MS / 1000, ease: EASE_OUT },
} as const;

export const popoverExitTransition = { duration: POPOVER_EXIT_MS / 1000, ease: EASE_IN } as const;
