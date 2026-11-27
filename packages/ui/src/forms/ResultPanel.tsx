import type { ReactNode } from "react";

export type ResultTone = "success" | "error";

const TONE = {
  success: {
    ring: "bg-[var(--sn-success)]/25",
    disc: "bg-[var(--sn-success)]",
    path: "M5 12.5l4.5 4.5L19 7.5",
  },
  error: {
    ring: "bg-[var(--sn-danger)]/25",
    disc: "bg-[var(--sn-danger)]",
    path: "M7 7l10 10M17 7L7 17",
  },
} as const;

/**
 * 基于 Satin 动效曲线与纯 CSS 描边绘制的操作结束页：
 * 一笔画对勾/叉号 + 轻盈涟漪，零 framer-motion 依赖。
 */
export function ResultPanel({
  tone = "success",
  title,
  description,
  children,
  actions,
  className,
}: {
  tone?: ResultTone;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const styles = TONE[tone];
  return (
    <div
      role="status"
      className={["grid min-h-full place-items-center px-6 py-10", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="grid w-full max-w-sm justify-items-center text-center">
        <div className="relative grid h-20 w-20 place-items-center">
          <span
            aria-hidden="true"
            className={["sn-result-ring absolute inset-0 rounded-full", styles.ring].join(" ")}
          />
          <span
            className={[
              "sn-pop-in grid h-16 w-16 place-items-center rounded-full text-white shadow-[var(--sn-e1)]",
              styles.disc,
            ].join(" ")}
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
              <path
                className="sn-draw-stroke"
                d={styles.path}
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>

        <div
          className="sn-fade-up mt-6 grid justify-items-center gap-2"
          style={{ animationDelay: "180ms" }}
        >
          <h3 className="text-lg font-semibold text-[var(--sn-label)]">{title}</h3>
          {children}
          {description ? <p className="text-sm text-[var(--sn-label2)]">{description}</p> : null}
        </div>

        {actions ? (
          <div
            className="sn-fade-up mt-7 flex flex-wrap items-center justify-center gap-2.5"
            style={{ animationDelay: "280ms" }}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
