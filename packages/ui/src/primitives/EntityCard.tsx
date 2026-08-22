import type { ReactNode } from "react";
import { Card } from "./Card";
import { OverflowTooltip } from "../overlays/Tooltip";

export interface EntityCardProps {
  /** Card title. Truncates, with the full value in a tooltip when it overflows. */
  title: string;
  /**
   * Denser paddings, radius and gaps, for grids of four columns or more.
   * Matches the AI accounts card's own dense mode.
   */
  dense?: boolean;
  selected?: boolean;
  /** Dim the card without hiding it, e.g. a disabled channel or account. */
  dimmed?: boolean;
  /** A second, lighter dim for rows that exist only at runtime. */
  muted?: boolean;
  onToggleSelected?: (checked: boolean) => void;
  /** Announced on the selection checkbox; required when it is rendered. */
  selectionLabel?: string;
  /**
   * Badges that belong beside the title rather than on a row of their own —
   * an id, a latency reading. On their own row they read as an empty band
   * under every card that has one.
   */
  titleAdornment?: ReactNode;
  /** Controls to the right of the title, after the selection checkbox. */
  headerControls?: ReactNode;
  /**
   * Fixed rows under the title — badges, chips, connection details. Each row
   * wraps within itself, so a narrow card never pulls a badge up into the row
   * above it.
   */
  header?: ReactNode;
  /** Row pinned to the bottom of the card. */
  footer?: ReactNode;
  /**
   * Fill the grid row rather than ending at the content. Right when a row's
   * cards hold similar amounts (AI accounts); wrong when they vary a lot, as
   * it pads the short ones out to the tallest.
   */
  fill?: boolean;
  /** Main body, between header and footer. */
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** test id for the body region, so pages can assert on their own content */
  bodyTestId?: string;
}

/**
 * The card used by the AI accounts and AI providers grids.
 *
 * Lifted verbatim from the AI accounts card, which is the reference for both
 * pages: a Card surface with a fixed-height title row, a stack of header rows
 * under it, a flexible body, and a footer pinned to the bottom. Both pages
 * render this component so neither can drift from the other.
 *
 * The selection checkbox is hidden until the card is hovered on pointer
 * devices, and always visible once selected or below `md`, where there is no
 * hover.
 */
export function EntityCard({
  title,
  dense = false,
  selected = false,
  dimmed = false,
  muted = false,
  fill = true,
  onToggleSelected,
  selectionLabel,
  titleAdornment,
  headerControls,
  header,
  footer,
  children,
  className,
  bodyClassName,
  bodyTestId,
}: EntityCardProps) {
  return (
    <Card
      padding={dense ? "compact" : "default"}
      bodyClassName={["mt-0 flex min-h-0 flex-1 flex-col", bodyClassName]
        .filter(Boolean)
        .join(" ")}
      className={[
        // Both `group` and `group/card`: children written against the plain
        // group variant keep working, and tests locate a card by `.group`.
        "group group/card flex w-full max-w-[34rem] flex-col border-slate-900/8 shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] transition-colors duration-200 ease-out hover:border-slate-300 hover:bg-white md:max-w-none dark:border-white/[0.08] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.28)] dark:hover:border-neutral-700 dark:hover:bg-neutral-950/70",
        fill ? "h-full" : "",
        dense ? "rounded-2xl" : "rounded-3xl",
        selected
          ? "border-slate-900 ring-1 ring-slate-300 dark:border-white dark:ring-white/20"
          : "",
        muted ? "opacity-90" : "",
        dimmed ? "opacity-85" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={dense ? "space-y-2" : "space-y-2.5"}>
        <div className="flex items-center gap-2">
          <OverflowTooltip
            content={title}
            title={title}
            className={[
              "min-w-0 truncate leading-5 font-semibold tracking-tight text-slate-900 dark:text-white",
              titleAdornment ? "" : "flex-1",
              dense ? "text-xs" : "text-sm",
            ].join(" ")}
          >
            {title}
          </OverflowTooltip>

          {titleAdornment ? (
            <div className="flex shrink-0 items-center gap-1">
              {titleAdornment}
            </div>
          ) : null}

          <div className="ml-auto flex h-6 shrink-0 items-center gap-1.5">
            {onToggleSelected ? (
              <div
                className={[
                  "flex h-6 w-6 items-center justify-center transition-opacity",
                  selected
                    ? "opacity-100 pointer-events-auto"
                    : "opacity-100 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100 md:group-hover/card:pointer-events-auto md:group-focus-within/card:pointer-events-auto",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  aria-label={selectionLabel}
                  checked={selected}
                  onChange={(event) =>
                    onToggleSelected(event.currentTarget.checked)
                  }
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 accent-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:accent-white dark:focus-visible:ring-white/15"
                />
              </div>
            ) : null}
            {headerControls}
          </div>
        </div>

        {header}
      </div>

      {children ? (
        <div
          data-testid={bodyTestId}
          className={[
            "min-h-0 min-w-0 flex-1 touch-pan-y px-0.5",
            dense ? "mt-2 py-0.5" : "mt-3 py-1",
          ].join(" ")}
        >
          {children}
        </div>
      ) : null}

      {footer ? (
        <div
          className={[
            "mt-auto flex items-center justify-between gap-2 border-t border-slate-100 dark:border-white/[0.06]",
            dense ? "pt-2" : "pt-3",
          ].join(" ")}
        >
          {footer}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Grid that lays out EntityCards, shared by both pages.
 *
 * One column on phones with the card centred and capped, two from `md`, and a
 * caller-chosen count from `xl`. `dense` tightens the gutter, as the accounts
 * page already did once it reached four columns.
 */
export function entityCardGridClass({
  columns = 3,
  dense = false,
  align = "stretch",
}: {
  columns?: 2 | 3 | 4 | 5 | 6;
  dense?: boolean;
  /**
   * `stretch` levels every card in a row, which suits cards of similar length.
   * `start` lets each card end at its own content, which suits grids whose
   * cards vary a lot in height.
   */
  align?: "stretch" | "start";
} = {}): string {
  const columnClass = {
    2: "xl:grid-cols-[repeat(2,minmax(0,1fr))]",
    3: "xl:grid-cols-[repeat(3,minmax(0,1fr))]",
    4: "xl:grid-cols-[repeat(4,minmax(0,1fr))]",
    5: "xl:grid-cols-[repeat(5,minmax(0,1fr))]",
    6: "xl:grid-cols-[repeat(6,minmax(0,1fr))]",
  }[columns];

  return [
    "grid grid-cols-1 justify-items-center md:grid-cols-2 md:justify-items-stretch",
    align === "stretch" ? "items-stretch" : "items-start",
    dense ? "gap-3" : "gap-5",
    columnClass,
  ].join(" ");
}
