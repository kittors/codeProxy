import markInlineDark from "./images/clirelay-mark-dark.png";
import markInline from "./images/clirelay-mark.png";
import markSolid from "./images/clirelay-mark-solid.png";

/**
 * CliRelay 品牌标记。
 *
 * 图形语义：多片曲面花瓣以螺旋方式向中心聚拢，形成有向心动势的旋涡 ——
 * 即「多家模型汇聚到一个入口」，与产品定位对应。
 *
 * 两个变体：
 * - `inline`：无底板的渐变符号，用于顶栏、页脚、弹窗等与文字并排的位置。
 * - `solid`：渐变圆角方底板 + 白色花瓣，用于 favicon / app icon / OG 图；
 *   实心底板保证在 16px 或任意背景色上轮廓不丢。
 *
 * 资源是透明 PNG，不能像 SVG 那样用 CSS 换色。内联版在深色底上需要更亮的一套色，
 * 所以出了浅色/暗色两张图并按主题切换（与 VendorIcon 同一套做法）；
 * `solid` 自带深底板，两种主题下对比都够，不需要切换。
 */

export type LogoMarkVariant = "inline" | "solid";

/** 内联标记接近正方形。用 size 控制高度，宽度按此比例推导，避免被拉伸。 */
const INLINE_ASPECT = 201 / 200;

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
  const shared = {
    width,
    height: size,
    alt: title ?? "",
    "aria-hidden": title ? undefined : true,
    draggable: false,
    style: { width, height: size },
  } as const;

  if (solid) {
    return <img src={markSolid} {...shared} className={className} />;
  }

  const join = (extra: string) => [extra, className].filter(Boolean).join(" ");
  return (
    <>
      <img src={markInline} {...shared} className={join("dark:hidden")} />
      <img src={markInlineDark} {...shared} className={join("hidden dark:block")} />
    </>
  );
}
