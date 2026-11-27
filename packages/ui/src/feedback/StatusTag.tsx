import type { HTMLAttributes, ReactNode } from "react";

export type StatusTagTone = "neutral" | "ok" | "warn" | "bad" | "need" | "run";

export interface StatusTagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Satin 状态圆点语义色：中性 / 正常(绿) / 警告(琥珀) / 错误(红) / 待处理(主色) / 运行中(脉冲) */
  tone?: StatusTagTone;
  /** md 24px（默认）或 sm 20px（紧凑表格单元格适用） */
  size?: "sm" | "md";
  /** 是否展示 6px 语义小圆点（默认开启，对齐 Satin 官方 .sn-tag） */
  dot?: boolean;
  children: ReactNode;
}

const TONE_CLASS: Record<StatusTagTone, string> = {
  neutral: "",
  ok: "sn-ok",
  warn: "sn-warn",
  bad: "sn-bad",
  need: "sn-need",
  run: "sn-run",
};

/**
 * Satin 原生状态胶囊（`.sn-tag`）：
 * 纯中性低饱和底色 + 6px 语义小圆点，彻底取代高饱和度彩色块与杂乱边框，
 * 无论浅色还是深色主题都保持克制、清晰、高可读性。
 */
export function StatusTag({
  tone = "neutral",
  size = "md",
  dot = true,
  className,
  children,
  ...props
}: StatusTagProps) {
  return (
    <span
      {...props}
      className={[
        "sn-tag",
        size === "sm" ? "sn-sm" : null,
        TONE_CLASS[tone],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? <i aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
