import { type PropsWithChildren, type ReactNode } from "react";
import { Loader } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { useResizeLayoutAnimation } from "../hooks/useResizeLayoutAnimation";
import { surface } from "./Surface";

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

/**
 * Padding and the matching inner radius, aligned with Satin `.sn-panel` (`rounded-xl`, 12px):
 * children in corners opt in with `rounded-inner` so nested blocks stay concentric with 12px cards.
 */
const PADDING = {
  default: "p-5 [--sn-inner-radius:var(--sn-r-md)]",
  compact: "p-3.5 [--sn-inner-radius:var(--sn-r-sm)]",
  none: "p-0 [--sn-inner-radius:var(--sn-r-lg)]",
} as const;

export function Card({
  title,
  description,
  actions,
  loading = false,
  flat = false,
  className,
  bodyClassName,
  padding = "default",
  children,
}: PropsWithChildren<{
  title?: ReactNode;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  /**
   * A page-level section rather than a card: no fill, edge, shadow or padding.
   *
   * The shell's content area is already the page's panel. A page that wraps all
   * of its content in one more card stacks a second frame inside the first —
   * the extra level the panel used to show on every list page.
   */
  flat?: boolean;
  className?: string;
  bodyClassName?: string;
  padding?: "default" | "compact" | "none";
}>) {
  const { t } = useTranslation();
  const reduceMotion = prefersReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      ref={cardRef}
      className={[
        "relative min-w-0",
        flat ? null : surface({ tone: "card", radius: "xl" }),
        "motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out",
        flat ? "p-0" : PADDING[padding],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-busy={loading}
    >
      {hasHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            {title ? (
              <h3
                className={
                  flat
                    ? "text-xl leading-7 font-semibold tracking-tight text-[var(--sn-label)]"
                    : "text-base leading-6 font-semibold tracking-tight text-[var(--sn-label)]"
                }
              >
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="text-xs leading-5 text-[var(--sn-label3)]">{description}</p>
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-[var(--sn-raised)]/72 backdrop-blur-[2px] motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out">
          <div className="inline-flex items-center gap-2 rounded-[var(--sn-btn-r)] bg-[var(--sn-overlay)] px-3.5 py-2 text-xs font-medium text-[var(--sn-label2)] shadow-[var(--sn-e1)]">
            <Loader variant="arc" size={16} label={t("common.loading_ellipsis")} />
            {t("common.loading_ellipsis")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
