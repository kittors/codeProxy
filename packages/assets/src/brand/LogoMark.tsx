import markInline from "./images/clirelay-mark.png";
import markSolid from "./images/clirelay-mark-solid.png";

/**
 * CliRelay 品牌标记。
 *
 * 图形语义：多条支路在中段汇聚，再合成一支箭头射出 —— 即「多家模型接入，一个入口输出」，
 * 与产品定位一一对应。
 *
 * 两个变体：
 * - `inline`：无底板的渐变符号，用于顶栏、页脚等与文字并排的位置。
 * - `solid`：渐变圆角方底板 + 白色负空间符号，用于 favicon / app icon / OG 图；
 *   实心底板保证在 16px 或任意背景色上轮廓不丢。
 *
 * 资源是透明 PNG（实际渲染尺寸不超过 64px，2x 屏也够用）。渐变本身在纯白与近黑上都有
 * 足够对比，因此浅色/暗色主题共用同一张图，不做运行时切换。
 */

export type LogoMarkVariant = "inline" | "solid";

/** 内联标记的宽高比（箭头造型天然横向）。用 size 控制高度，宽度按此比例推导。 */
const INLINE_ASPECT = 202 / 160;

export interface LogoMarkProps {
  /** 标记高度（px）。宽度由变体的宽高比决定。 */
  size?: number;
  variant?: LogoMarkVariant;
  className?: string;
  /** 传入后标记会作为有语义的图片暴露给读屏；不传则视为纯装饰。 */
  title?: string;
}

export function LogoMark({ size = 32, variant = "inline", className, title }: LogoMarkProps) {
  const solid = variant === "solid";
  const width = solid ? size : Math.round(size * INLINE_ASPECT);

  return (
    <img
      src={solid ? markSolid : markInline}
      width={width}
      height={size}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      draggable={false}
      className={className}
      style={{ width, height: size }}
    />
  );
}
