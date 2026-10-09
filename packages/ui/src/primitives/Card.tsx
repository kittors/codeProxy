import { type PropsWithChildren, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useResizeLayoutAnimation } from "../hooks/useResizeLayoutAnimation";
import { surface } from "./Surface";

/**
 * Padding and the matching inner radius, as one decision.
 *
 * A card is `rounded-3xl` (24). Anything that sits in its corner — a tinted well,
 * a table header, an image — reads as concentric only when its own radius is the
 * card's radius minus the inset between them: 24 − 16 = 8, 24 − 12 = 12. With any
 * other pair the two curves have different centres and the gap between them
 * swells at the diagonal, which is exactly the "four corners, four centres"
 * complaint. The card exports the right value as `--cp-inner-radius`; children
 * opt in with the `rounded-inner` utility instead of picking a radius by eye.
 */
const PADDING = {
  default: "p-4 [--cp-inner-radius:var(--radius-lg)]",
  compact: "p-3 [--cp-inner-radius:var(--radius-xl)]",
  none: "p-0 [--cp-inner-radius:var(--radius-3xl)]",
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
  const reduceMotion = useReducedMotion();
  const cardRef = useResizeLayoutAnimation<HTMLElement>(!reduceMotion);
  const hasHeader = Boolean(title || description || actions);

  return (
    <section
      ref={cardRef}
      className={[
        "relative min-w-0",
        flat ? null : surface({ tone: "card", radius: "3xl" }),
        "motion-reduce:transition-none motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out",
        flat ? "p-0" : PADDING[padding],
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-surface/70 backdrop-blur-[2px] motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out">
          <div className="inline-flex items-center gap-2 rounded-full bg-elevated px-4 py-2 text-sm font-medium text-ink-2 shadow-pop">
            <span className="h-4 w-4 rounded-full border-2 border-ink/15 border-t-ink motion-safe:animate-spin" />
            {t("common.loading_ellipsis")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
