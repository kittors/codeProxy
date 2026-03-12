import type { PropsWithChildren, ReactNode } from "react";

export function Card({
  title,
  description,
  actions,
  loading = false,
  className,
  bodyClassName,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
  bodyClassName?: string;
}>) {
  return (
    <section
      className={[
        "relative min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description ? (
            <p className="text-xs text-slate-600 dark:text-white/65">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className={["mt-4 min-w-0", bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-white">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-white/50 dark:border-t-transparent" />
            Loading…
          </div>
        </div>
      ) : null}
    </section>
  );
}
