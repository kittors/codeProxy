import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Card({
  title,
  description,
  actions,
  loading = false,
  className,
  bodyClassName,
  padding = "default",
  children,
}: PropsWithChildren<{
  title?: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
  bodyClassName?: string;
  padding?: "default" | "compact" | "none";
}>) {
  const { t } = useTranslation();
  const hasHeader = Boolean(title || description || actions);
  const paddingClass = {
    default: "p-5",
    compact: "p-3.5",
    none: "p-0",
  }[padding];

  return (
    <section
      className={[
        "relative min-w-0 rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]",
        "motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out",
        paddingClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            {title ? (
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
            ) : null}
            {description ? (
              <p className="text-xs text-slate-600 dark:text-white/65">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={[hasHeader ? "mt-4" : null, "min-w-0", bodyClassName].filter(Boolean).join(" ")}
      >
        {children}
      </div>
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:bg-neutral-950/55">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-white">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-white/50 dark:border-t-transparent" />
            {t("common.loading_ellipsis")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
