import type { ReactNode } from "react";
import { Card } from "./Card";
import { Checkbox } from "./Checkbox";
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
        // 悬停只把投影加深一档，不上浮：卡片里有开关、勾选框这类小目标，鼠标移上去时
        // 整张卡跟着挪 2px，正要点的那个控件也会跟着跑。
        "group group/card flex w-full max-w-[34rem] flex-col transition-[box-shadow,opacity] duration-250 ease-soft hover:shadow-lift md:max-w-none",
        fill ? "h-full" : "",
        // 紧凑卡片的圆角小一档（16），同心内圆角跟着改成 16 − 12 = 4（见 Card 的说明）。
        dense ? "rounded-2xl [--cp-inner-radius:var(--radius-sm)]" : "rounded-3xl",
        // 选中：把伪元素细边换成强调色，不再叠一圈墨色 ring——投影照常，卡片不会因为选中「变厚」。
        selected ? "[--cp-edge:var(--cp-accent)] dark:[--cp-edge:var(--cp-accent-ink)]" : "",
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
              "min-w-0 truncate leading-5 font-semibold tracking-tight text-ink",
              titleAdornment ? "" : "flex-1",
              dense ? "text-sm" : "text-base",
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
                <Checkbox
                  aria-label={selectionLabel}
                  checked={selected}
                  onCheckedChange={onToggleSelected}
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
            // 底部操作行靠留白和正文分开，不画分隔线。
            "mt-auto flex items-center justify-between gap-2",
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
        "relative flex w-full min-w-0 max-w-[34rem] flex-col md:max-w-none",
        surface({ tone: "card", radius: "3xl" }),
        dense ? "rounded-2xl p-3" : "rounded-3xl p-4",
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
            "mt-auto flex items-center gap-1.5",
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
