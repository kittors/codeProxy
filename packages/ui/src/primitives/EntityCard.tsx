import type { ReactNode } from "react";
import { Card } from "./Card";
import { surface } from "./Surface";
import { Skeleton } from "../feedback/Skeleton";
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
 * An EntityCard before its data arrives.
 *
 * Built from the same Card surface, paddings and row rhythm as EntityCard, so a
 * grid of these has the shape of the grid that replaces it: the cards do not
 * jump size or count when the response lands. Only for a cold paint — once a
 * card holds values, a refresh should update them in place rather than blanking
 * the card back to grey.
 *
 * `children` fills the body region; pass the placeholder that matches whatever
 * the page renders there (quota bars, a chart, lines of text). Left empty, the
 * body is three lines of text placeholder.
 */
export function EntityCardSkeleton({
  dense = false,
  fill = true,
  headerRows = 2,
  footer = true,
  children,
  className,
  testId,
}: {
  dense?: boolean;
  fill?: boolean;
  /** Badge rows under the title, matching the card's own header stack. */
  headerRows?: number;
  footer?: boolean;
  children?: ReactNode;
  className?: string;
  testId?: string;
}) {
  const safeHeaderRows = Math.max(0, Math.min(3, Math.round(headerRows)));
  return (
    // A plain surface rather than `Card`: the placeholder has to carry its own
    // test id and be hidden from assistive tech, and Card forwards neither.
    <section
      data-testid={testId}
      aria-hidden="true"
      className={[
        "relative flex w-full min-w-0 max-w-[34rem] flex-col border-slate-900/8 shadow-[0_8px_24px_rgb(15_23_42_/_0.04)] md:max-w-none dark:border-white/[0.08] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.28)]",
        surface({ tone: "card", radius: "3xl" }),
        dense ? "rounded-2xl p-3.5" : "rounded-3xl p-5",
        fill ? "h-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={dense ? "space-y-2" : "space-y-2.5"}>
        <div className="flex h-6 items-center gap-2">
          <Skeleton className={dense ? "h-3 w-2/5" : "h-3.5 w-1/2"} rounded="full" />
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Skeleton className="h-5 w-5" rounded="md" />
          </div>
        </div>
        {Array.from({ length: safeHeaderRows }, (_, row) => (
          <div key={row} className="flex flex-wrap items-center gap-1">
            {(row === 0 ? ["w-16", "w-10", "w-12"] : ["w-20", "w-14"]).map((width) => (
              <Skeleton key={width} className={`h-5 ${width}`} rounded="md" />
            ))}
          </div>
        ))}
      </div>

      <div
        className={[
          "min-h-0 min-w-0 flex-1 px-0.5",
          dense ? "mt-2 py-0.5" : "mt-3 py-1",
        ].join(" ")}
      >
        {children ?? (
          <div className={dense ? "space-y-2" : "space-y-3"}>
            {["w-full", "w-11/12", "w-9/12"].map((width) => (
              <Skeleton key={width} className={`h-3.5 ${width}`} />
            ))}
          </div>
        )}
      </div>

      {footer ? (
        <div
          className={[
            "mt-auto flex items-center gap-1.5 border-t border-slate-100 dark:border-white/[0.06]",
            dense ? "pt-2" : "pt-3",
          ].join(" ")}
        >
          {[0, 1, 2].map((index) => (
            <Skeleton
              key={index}
              className={dense ? "h-6 w-6" : "h-7 w-7"}
              rounded="md"
            />
          ))}
        </div>
      ) : null}
    </section>
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
