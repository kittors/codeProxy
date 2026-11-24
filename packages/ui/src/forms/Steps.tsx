import type { ReactNode } from "react";
import { Icon } from "satin-ui/react";

export type StepState = "upcoming" | "active" | "done";

/**
 * 基于 Satin 步骤视觉语言与纯 CSS 合成线程微动效的纵向步骤条：
 * - 激活步骤带柔和涟漪脉冲；
 * - 完成步骤使用 Satin 弹性缩放对勾与连线推进动效；
 * - 零 framer-motion 依赖，严格响应 prefers-reduced-motion。
 */
export function Steps({ children, className }: { children: ReactNode; className?: string }) {
  return <ol className={["grid", className].filter(Boolean).join(" ")}>{children}</ol>;
}

function StepMarker({ index, state }: { index: number; state: StepState }) {
  return (
    <span className="relative z-10 grid h-7 w-7 place-items-center">
      {state === "active" ? (
        <span
          aria-hidden="true"
          className="sn-step-pulse absolute inset-0 rounded-full bg-[var(--sn-accent)]"
        />
      ) : null}
      <span
        className={[
          "relative grid h-7 w-7 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200",
          state === "done"
            ? "bg-[var(--sn-success)] text-white"
            : state === "active"
              ? "bg-[var(--sn-accent)] text-[var(--sn-on-primary)]"
              : "bg-[var(--sn-raised)] text-[var(--sn-label3)] shadow-[inset_0_0_0_1px_var(--sn-line-control)]",
        ].join(" ")}
      >
        {state === "done" ? (
          <span className="sn-pop-in inline-flex">
            <Icon name="check" size={14} />
          </span>
        ) : (
          <span>{index}</span>
        )}
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
          className="absolute top-8 bottom-1 left-3.5 w-px -translate-x-1/2 overflow-hidden rounded-full bg-[var(--sn-line)]"
        >
          <span
            className="absolute inset-0 origin-top bg-[var(--sn-success)] transition-transform duration-400 ease-[var(--sn-ease-out-strong)] motion-reduce:transition-none"
            style={{ transform: `scaleY(${state === "done" ? 1 : 0})` }}
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
        <p className="text-sm leading-7 font-semibold text-[var(--sn-label)]">{title}</p>
        {description ? <div className="text-sm text-[var(--sn-label2)]">{description}</div> : null}
        {children ? <div className="mt-3 min-w-0">{children}</div> : null}
      </div>
    </li>
  );
}
