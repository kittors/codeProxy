import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

export type StepState = "upcoming" | "active" | "done";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * 步骤条：整条路径一直留在屏幕上（还没到的步骤只是变淡），用户一开始就知道后面还要做什么——
 * 「添加 AI 账号」里，用户从第一步就看得到「待会儿要粘贴地址」，而不是等浏览器跳到一个
 * 打不开的页面才发现。导入、迁移这类多步操作都用它。
 */
export function Steps({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={["grid", className].filter(Boolean).join(" ")}>{children}</ol>;
}

function StepMarker({ index, state }: { index: number; state: StepState }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="relative z-10 grid h-7 w-7 place-items-center">
      {state === "active" && !reduceMotion ? (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-accent"
          initial={{ opacity: 0.28, scale: 1 }}
          animate={{ opacity: 0, scale: 1.75 }}
          transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
        />
      ) : null}
      <span
        className={[
          "relative grid h-7 w-7 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200",
          state === "done"
            ? "bg-emerald-500 text-white"
            : state === "active"
              ? "bg-accent text-accent-fg"
              : "bg-surface text-ink-3 shadow-control",
        ].join(" ")}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {state === "done" ? (
            <motion.span
              key="done"
              initial={reduceMotion ? false : { scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 26 }}
            >
              <Check size={14} strokeWidth={3} aria-hidden="true" />
            </motion.span>
          ) : (
            <motion.span
              key="index"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.15 }}
            >
              {index}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </span>
  );
}

export function Step({
  index,
  state,
  title,
  description,
  last = false,
  children,
}: {
  index: number;
  state: StepState;
  title: ReactNode;
  description?: ReactNode;
  last?: boolean;
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <li
      aria-current={state === "active" ? "step" : undefined}
      data-step-state={state}
      className={[
        "relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3.5",
        last ? "" : "pb-6",
      ].join(" ")}
    >
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2 overflow-hidden rounded-full bg-line"
        >
          <motion.span
            className="absolute inset-0 origin-top bg-emerald-500"
            initial={false}
            animate={{ scaleY: state === "done" ? 1 : 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.45, ease: EASE }}
          />
        </span>
      )}
      <StepMarker index={index} state={state} />
      <div
        className={[
          "min-w-0 transition-opacity duration-300",
          state === "upcoming" ? "opacity-55" : "opacity-100",
        ].join(" ")}
      >
        <p className="text-sm leading-7 font-semibold text-ink">{title}</p>
        {description ? <div className="text-sm text-ink-2">{description}</div> : null}
        {children ? <div className="mt-3 min-w-0">{children}</div> : null}
      </div>
    </li>
  );
}
