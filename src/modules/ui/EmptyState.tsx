import type { ReactNode } from "react";

export function EmptyState({
  title = "暂无数据",
  description,
  icon,
  action,
}: {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/40">
      {icon ? (
        <div className="mx-auto mb-3 flex justify-center text-slate-500 dark:text-white/55">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-[42rem] text-sm text-slate-600 dark:text-white/65">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
