/**
 * 全局动效常量。
 *
 * 目的是让弹窗、抽屉、toast、按钮、页面切换共用同一套时间与曲线——各处各写一套
 * duration 与 cubic-bezier 时，界面会显得「每个控件性格不同」，这是廉价感的主要来源。
 * 这里的曲线与 styles/index.css 里的 `--ease-soft` / `--ease-spring` 是同一组数值，
 * Tailwind 类（ease-soft / ease-spring）和 JS 动画因此能保持一致。
 *
 * 曲线选择：进场用减速曲线（起步快、收尾缓，像滑到位而不是弹一下）；
 * 只有弹窗这类「被放到桌面上」的物件用带一点回弹的曲线做位移/缩放；
 * 退场用更短的 ease-in（用户已经决定关闭，不该再等动画）。
 */

/** 进场缓动：起步快、收尾缓。对应 CSS 的 --ease-soft。 */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
/** 轻回弹：落位时略微越过再回正。对应 CSS 的 --ease-spring，只用于位移和缩放。 */
export const EASE_SPRING = [0.3, 1.25, 0.5, 1] as const;
/** 退场缓动：略微加速离场。 */
export const EASE_IN = [0.4, 0, 1, 1] as const;

/** 覆盖层（弹窗 / 抽屉）进出时长，单位毫秒。退场刻意比进场短。 */
export const OVERLAY_ENTER_MS = 250;
export const OVERLAY_EXIT_MS = 160;
/** 弹窗面板的位移/缩放比淡入更长一点，回弹才有时间落稳。 */
export const OVERLAY_TRANSFORM_ENTER_MS = 360;

/** 小控件（toast、提示条、行内展开）的时长。 */
export const CONTROL_ENTER_MS = 200;

/** 悬停/按压的弹簧参数。刚度高、阻尼足，手感是「跟手」而不是「晃」。 */
export const PRESS_SPRING = { type: "spring", stiffness: 420, damping: 26 } as const;

export const cssEase = (curve: readonly [number, number, number, number]): string =>
  `cubic-bezier(${curve.join(", ")})`;
