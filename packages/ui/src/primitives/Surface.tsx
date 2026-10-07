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
const EDGE = "border border-line";

/**
 * Fills come from the semantic tokens in styles/index.css, so light/dark is a
 * variable swap rather than a pair of classes per tone. `shadow-card` is only the
 * soft drop part of the card shadow — the hairline edge stays a border (see above).
 */
const TONE: Record<SurfaceTone, string> = {
  /** Top-level card sitting directly on the page background. */
  card: "bg-surface shadow-card",
  /** Nested block that should read as lifted off its parent card. */
  raised: "bg-surface shadow-xs dark:bg-white/[0.04] dark:shadow-none",
  /** Nested block that should read as recessed — code blocks, previews, wells. */
  inset: "bg-subtle",
  /** Opaque surface with no elevation, e.g. popovers over dense content. */
  plain: "bg-surface",
  /** Dashboard-style panel: same quiet card, kept as a name for existing call sites. */
  panel: "bg-surface shadow-card",
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
