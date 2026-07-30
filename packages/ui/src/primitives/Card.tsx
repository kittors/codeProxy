import { type PropsWithChildren, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useResizeLayoutAnimation } from "../hooks/useResizeLayoutAnimation";

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
  title?: ReactNode;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  className?: string;
  bodyClassName?: string;
  padding?: "default" | "compact" | "none";
}>) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);
  const hasHeader = Boolean(title || description || actions);
  const paddingClass = {
    default: "p-5",
    compact: "p-3.5",
    none: "p-0",
  }[padding];

  return (
    <section
      ref={cardRef}
      className={[
        "relative min-w-0 rounded-3xl bg-white ring-1 ring-slate-900/8 dark:bg-white/[0.03] dark:ring-white/8",
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/70 backdrop-blur-sm motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:bg-neutral-950/55">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-900/8 motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out dark:bg-neutral-900/85 dark:text-white dark:ring-white/10">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-600 dark:border-indigo-400/25 dark:border-t-indigo-400" />
            {t("common.loading_ellipsis")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
