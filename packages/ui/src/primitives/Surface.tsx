import { type PropsWithChildren } from "react";

export type SurfaceRadius = "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
export type SurfaceTone = "card" | "raised" | "inset" | "plain" | "panel";

// Tailwind must see full class strings — keep these maps static.
const RADIUS: Record<SurfaceRadius, string> = {
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
  full: "rounded-full",
};

/**
 * A border, never a ring.
 *
 * `ring-*` paints outside the border box, so any scrolling or `overflow-hidden`
 * ancestor clips it and the edge appears to break off mid-card — which is what
 * happened to every card on pages that scroll. A border is painted inside the
 * box and survives clipping.
 */
const EDGE = "border border-slate-900/8 dark:border-white/8";

const TONE: Record<SurfaceTone, string> = {
  /** Top-level card sitting directly on the page background. */
  card: "bg-white dark:bg-white/[0.03]",
  /** Nested block that should read as lifted off its parent card. */
  raised: "bg-white/70 shadow-sm dark:bg-neutral-950/60",
  /** Nested block that should read as recessed — code blocks, previews, wells. */
  inset: "bg-slate-50 dark:bg-neutral-900",
  /** Opaque surface with no elevation, e.g. popovers over dense content. */
  plain: "bg-white dark:bg-neutral-950",
  /** Dashboard-style panel: opaque with a soft drop shadow. */
  panel:
    "bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)] dark:bg-neutral-950/85 dark:shadow-[0_10px_26px_rgba(0,0,0,0.28)]",
};

export type SurfaceOptions = {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  /** Drop the edge for surfaces that only need the fill. */
  bordered?: boolean;
};

/**
 * The single source of truth for "a bordered box" in the admin panel.
 *
 * Before this existed the same three decisions — radius, edge, fill — were
 * re-made inline at every call site, which produced 69 distinct combinations
 * across 166 places and no two pages that agreed.
 */
export const surface = ({ tone = "card", radius = "2xl", bordered = true }: SurfaceOptions = {}) =>
  [RADIUS[radius], bordered ? EDGE : null, TONE[tone]].filter(Boolean).join(" ");

/**
 * Component form for plain containers. Reach for `Card` when the box needs a
 * title, actions or a loading veil; use this for nested blocks inside one.
 */
export function Surface({
  tone,
  radius,
  bordered,
  className,
  children,
}: PropsWithChildren<SurfaceOptions & { className?: string }>) {
  return (
    <div className={[surface({ tone, radius, bordered }), className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
