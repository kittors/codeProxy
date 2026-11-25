import type { ReactNode } from "react";

export type LandingButtonTone = "primary" | "outline" | "invert";

const TONE_CLASS: Record<LandingButtonTone, string> = {
  primary: "sn-primary",
  outline: "sn-secondary",
  invert: "!bg-white !text-[#1d1d1f] hover:!bg-white/90",
};

/**
 * 基于 Satin `.sn-btn` 的落地页按钮：
 * 摒弃悬停上浮，采用 Satin 物理按压微缩放与 8px 利落圆角，零 framer-motion 依赖。
 */
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
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={[
        "sn-btn shrink-0 font-semibold",
        size === "sm" ? "!h-9 !px-4 !text-sm" : "!h-12 !px-7 !text-sm",
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}
