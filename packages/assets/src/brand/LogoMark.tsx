/**
 * CliRelay 品牌标记：精密双翼接力棱镜。
 *
 * 图形语义：两片 45° 锐切平行折翼构成「上游入站 → 协议中继转发」的矢量动能，后翼轻透、前翼实面，
 * 右侧同斜率嵌入一颗翡翠菱形信标代表在线下一跳。全图形以实面几何而非圆头折线构建，
 * 在 16px favicon 到 48px 展示尺寸下均保持瑞士精工级别的光学锐度与视觉居中。
 *
 * 两个变体：
 * - `inline`（默认）：跟随主题的墨色底板——浅色界面里是近黑底板 + 白色折翼，深色界面里
 *   反转成云白底板 + 深色折翼，颜色取自 `--sn-label` / `--sn-workspace`。
 * - `solid`：固定近黑底板 + 白色折翼，用于拿不到主题变量的场合（导出图片、外部嵌入）。
 *
 * favicon、apple-touch-icon 由同一份图形导出（apps/admin-panel/public），
 * 修改此处几何路径时需同步重新导出。
 */

export type LogoMarkVariant = "inline" | "solid";

const RELAY_GREEN = "#10b981";

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
  const plate = fixed ? "#0f1115" : "var(--sn-label, #0f1115)";
  const glyph = fixed ? "#ffffff" : "var(--sn-workspace, #ffffff)";

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
      <rect width="32" height="32" rx="8.5" fill={plate} />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="8"
        fill="none"
        stroke={glyph}
        strokeOpacity="0.14"
        strokeWidth="1"
      />
      {/* 后翼：半透明 45° 精密斜切折翼 */}
      <path
        d="M5.5 9.5H8.9L15.4 16L8.9 22.5H5.5L12 16Z"
        fill={glyph}
        fillOpacity="0.34"
      />
      {/* 前翼：实面主接力棱柱，与后翼严格保持 45° 等距缝隙 */}
      <path
        d="M11 9.5H14.6L21.1 16L14.6 22.5H11L17.5 16Z"
        fill={glyph}
      />
      {/* 同斜率 45° 翡翠菱晶信标，左右边距光学配平（左 5.5 / 右 5.2） */}
      <path d="M24.7 13.9L26.8 16L24.7 18.1L22.6 16Z" fill={RELAY_GREEN} />
    </svg>
  );
}
