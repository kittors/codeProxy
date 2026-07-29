import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type LandingButtonTone = "primary" | "outline" | "invert";

/**
 * 落地页按钮的唯一样式来源。
 *
 * 之前顶栏用设计系统的黑底 Button、hero 用靛蓝按钮，同屏两套主色显得割裂；
 * 这里统一收口：靛蓝是品牌主色，反色区（深底）才切到白底按钮。
 */
const TONE_CLASS: Record<LandingButtonTone, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500/40 dark:bg-indigo-500 dark:hover:bg-indigo-400",
  outline:
    "border border-slate-900/12 bg-white/70 text-slate-700 hover:border-slate-900/25 hover:bg-white focus-visible:ring-slate-900/15 dark:border-white/12 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-white/25 dark:hover:bg-white/10",
  invert:
    "bg-white text-slate-950 hover:bg-slate-100 focus-visible:ring-white/40",
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-45",
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
