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
 * The edge is a hairline drawn by the `.cp-edge` pseudo-element (styles/index.css),
 * never a border and never an outer ring.
 *
 * An outer `ring-*` paints outside the box, so any scrolling or `overflow-hidden`
 * ancestor clipped it and the edge broke off mid-card; a border fixed that but
 * gave every box a drawn outline, and boxes nested three deep read as a stack of
 * frames. The pseudo-element is an inset shadow inside the box: nothing clips it,
 * it sits above children that paint their own fill, and it takes no layout space.
 */
const EDGE = "cp-edge";

/**
 * Fills come from the semantic tokens in styles/index.css, so light/dark is a
 * variable swap rather than a pair of classes per tone. Depth is the layered
 * drop shadow on the element itself (`shadow-card`). Opaque tones also set
 * `--cp-backdrop`, so a table's frozen columns inside them match the card.
 *
 * There is one level of elevation. A block nested inside a card does not get a
 * second card around it — `raised` and `inset` are flat tinted wells with no edge
 * and no shadow. Stacked frames (card in card in card, each with its own outline)
 * were the main reason the panel read as cluttered.
 */
const TONE: Record<SurfaceTone, string> = {
  /** Top-level card sitting directly on the content area. */
  card: "bg-surface shadow-card [--cp-backdrop:var(--cp-surface)]",
  /** Nested block inside a card. Kept as a name for existing call sites; it is a flat well now. */
  raised: "bg-subtle",
  /** Nested block that should read as recessed — code blocks, previews, wells. */
  inset: "bg-subtle",
  /** Opaque surface with no elevation, e.g. popovers over dense content. */
  plain: "bg-surface [--cp-backdrop:var(--cp-surface)]",
  /** Dashboard-style panel: same quiet card, kept as a name for existing call sites. */
  panel: "bg-surface shadow-card [--cp-backdrop:var(--cp-surface)]",
};

/** Tones that sit on the content area and need an edge; wells inside a card never do. */
const EDGED_TONES = new Set<SurfaceTone>(["card", "plain", "panel"]);

export type SurfaceOptions = {
  tone?: SurfaceTone;
  radius?: SurfaceRadius;
  /** Drop the hairline edge for surfaces that only need the fill. */
  bordered?: boolean;
};

/**
 * The single source of truth for "a box" in the admin panel.
 *
 * Before this existed the same three decisions — radius, edge, fill — were
 * re-made inline at every call site, which produced 69 distinct combinations
 * across 166 places and no two pages that agreed.
 */
export const surface = ({ tone = "card", radius = "2xl", bordered = true }: SurfaceOptions = {}) =>
  [RADIUS[radius], bordered && EDGED_TONES.has(tone) ? EDGE : null, TONE[tone]]
    .filter(Boolean)
    .join(" ");

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
