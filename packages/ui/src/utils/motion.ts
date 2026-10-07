/**
 * 全局动效常量。
 *
 * 目的是让弹窗、抽屉、下拉、菜单、toast 共用同一套时间与曲线——各处各写一套
 * duration 与 cubic-bezier 时，界面会显得「每个控件性格不同」，这是廉价感的主要来源。
 * 这里的曲线与 styles/index.css 里的 `--ease-soft` / `--ease-pop` / `--ease-spring` 是同一组数值，
 * Tailwind 类（ease-soft / ease-pop / ease-spring）和 JS 动画因此能保持一致。
 *
 * 弹出物（下拉、菜单、弹窗、抽屉、toast）统一的节奏：
 * - 进场：透明度很快到位（约 120–200ms），位移 / 缩放用指数减速曲线走得更久一点（200–320ms），
 *   读起来是「一下就出现，再轻轻落稳」；不用回弹——弹出物越过终点再回来，看着像在晃。
 * - 退场：更短的 ease-in，位移更小。用户已经决定关闭，不该再等动画。
 * - 弹窗、抽屉的遮罩与面板分层：面板先走，遮罩稍后褪去，关闭时不会整块一起闪掉。
 */

/** 普通过渡（悬停、展开、颜色）：起步快、收尾缓。对应 CSS 的 --ease-soft。 */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
/**
 * 弹出物进场（指数减速）：前三成时间走完大半程，随后长长地收尾，不越过终点。
 * 对应 CSS 的 --ease-pop。
 */
export const EASE_POP = [0.16, 1, 0.3, 1] as const;
/** 轻回弹：落位时略微越过再回正。对应 CSS 的 --ease-spring，只留给开关、勾选这类小控件。 */
export const EASE_SPRING = [0.3, 1.25, 0.5, 1] as const;
/** 退场缓动：略微加速离场。 */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** 下拉、菜单、浮层：透明度、位移 / 缩放、退场的时长，单位毫秒。 */
export const POPOVER_FADE_MS = 120;
export const POPOVER_ENTER_MS = 200;
export const POPOVER_EXIT_MS = 110;

/** 弹窗 / 抽屉：遮罩与面板淡入、面板位移 / 缩放、面板退场、遮罩退场。 */
export const OVERLAY_ENTER_MS = 200;
export const OVERLAY_TRANSFORM_ENTER_MS = 320;
export const OVERLAY_PANEL_EXIT_MS = 150;
/** 遮罩比面板晚一点褪完；也是关闭后卸载 DOM 的时刻。 */
export const OVERLAY_EXIT_MS = 200;

/** 小控件（toast、提示条、行内展开）的时长。 */
export const CONTROL_ENTER_MS = 200;

/** 悬停/按压的弹簧参数。刚度高、阻尼足，手感是「跟手」而不是「晃」。 */
export const PRESS_SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

export const cssEase = (curve: readonly [number, number, number, number]): string =>
  `cubic-bezier(${curve.join(", ")})`;

/**
 * framer-motion 驱动的浮层（Select 系列下拉、侧边栏收起后的分区浮层）共用的过渡：
 * 透明度单独走更短的线性淡入，位移 / 缩放走 EASE_POP。
 */
export const popoverEnterTransition = {
  duration: POPOVER_ENTER_MS / 1000,
  ease: EASE_POP,
  opacity: { duration: POPOVER_FADE_MS / 1000, ease: "linear" },
} as const;

export const popoverExitTransition = { duration: POPOVER_EXIT_MS / 1000, ease: EASE_IN } as const;
