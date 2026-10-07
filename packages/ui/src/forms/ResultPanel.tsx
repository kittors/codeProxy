import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

export type ResultTone = "success" | "error";

const TONE = {
  success: { ring: "bg-emerald-500/25", disc: "bg-emerald-500", path: "M5 12.5l4.5 4.5L19 7.5" },
  error: { ring: "bg-rose-500/25", disc: "bg-rose-500", path: "M7 7l10 10M17 7L7 17" },
} as const;

/**
 * 操作结束页：一个会「画」出来的对勾（或叉），标题说清结果，下面放结果本身
 * （新账号、导入了几条、生成的凭证……）和下一步按钮。
 * 比一条转瞬即逝的 toast 更适合「做完一件事、可能还要接着做下一件」的弹窗。
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
  const reduceMotion = useReducedMotion();
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
          {reduceMotion ? null : (
            <motion.span
              aria-hidden="true"
              className={["absolute inset-0 rounded-full", styles.ring].join(" ")}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.9, opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
            />
          )}
          <motion.span
            className={[
              "grid h-16 w-16 place-items-center rounded-full text-white shadow-lift",
              styles.disc,
            ].join(" ")}
            initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden="true">
              <motion.path
                d={styles.path}
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}
              />
            </svg>
          </motion.span>
        </div>

        <motion.div
          className="mt-6 grid justify-items-center gap-2"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE, delay: 0.3 }}
        >
          <h3 className="text-lg font-semibold text-ink">{title}</h3>
          {children}
          {description ? <p className="text-sm text-ink-2">{description}</p> : null}
        </motion.div>

        {actions ? (
          <motion.div
            className="mt-7 flex flex-wrap items-center justify-center gap-2.5"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.45 }}
          >
            {actions}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
