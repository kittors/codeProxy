import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type LandingButtonTone = "primary" | "outline" | "invert";

/**
 * 落地页按钮的唯一样式来源。
 *
 * 之前顶栏用设计系统的黑底 Button、hero 用靛蓝按钮，同屏两套主色显得割裂；
 * 这里统一收口：主按钮是全站的强调色（多彩风格默认墨色，简约风格是蓝），反色区（深底）才切到
 * 白底按钮。
 * 描边按钮和控件一样用阴影描边（shadow-control），不画 border；焦点也是同一套阴影焦点环。
 */
const TONE_CLASS: Record<LandingButtonTone, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover focus-visible:shadow-control-focus",
  outline:
    "bg-surface/70 text-ink-2 shadow-control hover:bg-surface hover:text-ink hover:shadow-control-hover focus-visible:shadow-control-focus",
  invert: "bg-white text-slate-950 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-white/40",
};

export function LandingButton({
  children,
  onClick,
  tone = "primary",
  size = "md",
  type = "button",
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: LandingButtonTone;
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const reduceMotion = useReducedMotion();
  const interactive = !reduceMotion && !disabled;

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      // 轻微抬升 + 按下回弹，用弹簧而不是线性过渡，手感才不「硬」。
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.97, y: 0 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 26 }}
      className={[
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,color] duration-150 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45",
        size === "sm" ? "h-9 px-4 text-sm" : "h-12 px-7 text-sm",
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </motion.button>
  );
}
