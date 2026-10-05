import { type PropsWithChildren, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useResizeLayoutAnimation } from "../hooks/useResizeLayoutAnimation";
import { surface } from "./Surface";

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
        "relative min-w-0",
        surface({ tone: "card", radius: "3xl" }),
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
              <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
            ) : null}
            {description ? (
              <p className="text-sm text-ink-3">{description}</p>
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-surface/70 backdrop-blur-[2px] motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out">
          <div className="inline-flex items-center gap-2 rounded-full bg-elevated px-4 py-2 text-sm font-medium text-ink-2 shadow-pop">
            <span className="h-4 w-4 rounded-full border-2 border-ink/15 border-t-ink motion-safe:animate-spin" />
            {t("common.loading_ellipsis")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
