/**
 * CliRelay 品牌标记：双箭头。
 *
 * 图形语义：命令行提示符「›」叠成两层就是「转发」——后一层半透明、前一层实心，读起来是
 * 一次往前的接力；末端一颗绿色小点表示在线的下一跳。绿色与界面里「在线 / 成功」同一色相。
 *
 * 用 SVG 画而不是位图：颜色能直接跟随主题，任何尺寸都清晰。
 *
 * 两个变体：
 * - `inline`（默认）：跟随主题的墨色底板——浅色界面里是近黑底板 + 白色箭头，深色界面里
 *   反转成浅色底板 + 深色箭头，颜色取自 `--cp-ink` / `--cp-canvas`。不用强调色：强调色
 *   （蓝）是交互状态的颜色，品牌标记染成蓝色会读成「被选中」。
 * - `solid`：固定近黑底板 + 白色箭头，给拿不到主题变量的场合（导出图片、外部嵌入）。
 *
 * favicon、apple-touch-icon、og-image 由同一份图形导出（apps/admin-panel/public），
 * 改这里的图形时要一起重新导出。
 */

export type LogoMarkVariant = "inline" | "solid";

const RELAY_GREEN = "#10a37f";

export interface LogoMarkProps {
  /** 标记边长（px），标记是正方形。 */
  size?: number;
  variant?: LogoMarkVariant;
  className?: string;
  /** 传入后标记会作为有语义的图片暴露给读屏；不传则视为纯装饰。 */
  title?: string;
}

export function LogoMark({ size = 32, variant = "inline", className, title }: LogoMarkProps) {
  const fixed = variant === "solid";
  const plate = fixed ? "#0d0d0d" : "var(--cp-ink, #0d0d0d)";
  const glyph = fixed ? "#ffffff" : "var(--cp-canvas, #ffffff)";

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="9" fill={plate} />
      {/* 整组图形比几何中心偏左 1 个单位：右端的绿点让视觉重心偏右，这样看起来才居中。 */}
      <path
        d="M8.5 10.5 14 16l-5.5 5.5"
        fill="none"
        stroke={glyph}
        strokeOpacity="0.42"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 10.5 20.5 16 15 21.5"
        fill="none"
        stroke={glyph}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.6" cy="16" r="1.7" fill={RELAY_GREEN} />
    </svg>
  );
}
