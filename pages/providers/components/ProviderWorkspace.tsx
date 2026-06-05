import { type ReactNode } from "react";

type ProviderWorkspaceProps = {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
  actions?: ReactNode;
};

export function ProviderWorkspace({
  title,
  description,
  count,
  children,
  actions,
}: ProviderWorkspaceProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-neutral-800">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            {count > 0 ? (
              <span className="text-xs text-slate-400 dark:text-white/40">{count}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-white/55">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </section>
  );
}
