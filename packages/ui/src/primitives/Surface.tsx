import { type PropsWithChildren } from "react";

export type SurfaceRadius = "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
export type SurfaceTone = "card" | "raised" | "inset" | "plain" | "panel";

// Tailwind must see full class strings — keep these maps static.
const RADIUS: Record<SurfaceRadius, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  full: "rounded-full",
};

/**
 * Satin 原生表面边框与分层：
 * - 顶层卡片（card / plain / panel）对齐 Satin `.sn-panel`：1px 实线描边（--sn-line）+ 抬升表面（--sn-raised），无脏阴影；
 * - 卡片内嵌槽（raised / inset）使用柔和浅灰槽（--sn-fill-subtle），绝不叠第二层卡片框线；
 * - 不透明表面同步导出 `--sn-backdrop`，确保内部冻结列与所在容器底色严丝合缝。
 */
const EDGE = "border border-sn-line";

const TONE: Record<SurfaceTone, string> = {
  card: "bg-sn-raised [--sn-backdrop:var(--sn-raised)]",
  raised: "bg-sn-subtle",
  inset: "bg-sn-subtle",
  plain: "bg-sn-raised [--sn-backdrop:var(--sn-raised)]",
  panel: "bg-sn-raised [--sn-backdrop:var(--sn-raised)]",
};

const EDGED_TONES = new Set<SurfaceTone>(["card", "plain", "panel"]);

export type SurfaceOptions = {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  /** Drop the hairline border for surfaces that only need the fill. */
  bordered?: boolean;
};

/**
 * 全站容器表面唯一真源（对齐 Satin `.sn-panel`：12px 圆角、1px `--sn-line` 细描边、纯平实面底）。
 */
export const surface = ({ tone = "card", radius = "xl", bordered = true }: SurfaceOptions = {}) =>
  [RADIUS[radius], bordered && EDGED_TONES.has(tone) ? EDGE : null, TONE[tone]]
    .filter(Boolean)
    .join(" ");

export function Surface({
  tone,
  radius,
  bordered,
  className,
  children,
}: PropsWithChildren<SurfaceOptions & { className?: string }>) {
  return (
    <div className={[surface({ tone, radius, bordered }), className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
