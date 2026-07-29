/**
 * 全局动效常量。
 *
 * 目的是让弹窗、抽屉、toast、按钮、页面切换共用同一套时间与曲线——各处各写一套
 * duration 与 cubic-bezier 时，界面会显得「每个控件性格不同」，这是廉价感的主要来源。
 *
 * 曲线选择：进场用 expo-out（起步快、收尾极缓，像滑到位而不是弹一下），
 * 退场用更短的 ease-in（用户已经决定关闭，不该再等动画）。
 */

/** 进场缓动：起步快、收尾缓。 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** 退场缓动：略微加速离场。 */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** 覆盖层（弹窗 / 抽屉）进出时长，单位毫秒。退场刻意比进场短。 */
export const OVERLAY_ENTER_MS = 260;
export const OVERLAY_EXIT_MS = 160;

/** 小控件（toast、提示条、行内展开）的时长。 */
export const CONTROL_ENTER_MS = 200;

/** 悬停/按压的弹簧参数。刚度高、阻尼足，手感是「跟手」而不是「晃」。 */
export const PRESS_SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

export const cssEase = (curve: readonly [number, number, number, number]): string =>
  `cubic-bezier(${curve.join(", ")})`;
