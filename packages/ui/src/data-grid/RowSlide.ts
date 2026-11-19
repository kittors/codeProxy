import { Component, type RefObject } from "react";

const SLIDE_MS = 320;
const SLIDE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
/** A slide across most of a screen reads as the table jumping, not moving; such rows just land. */
const MAX_SLIDE_PX = 1600;

type Tops = ReadonlyMap<string, number>;

interface RowSlideProps {
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  /** The keys of the drawn rows, in order and joined: the rows slide when this changes. */
  order: string;
  reduceMotion: boolean;
}

/**
 * FLIP for the rows of a grid: after the drawn rows change, every row that was already there slides
 * from where it was to where it is now, its expanded detail row with it. Sorting, moving a row and a
 * refresh that adds rows above all use it. Rows that are entering have their own animation.
 *
 * Where a row was is read right before React changes the rows (getSnapshotBeforeUpdate, which only a
 * class component has), not remembered from the last change. Rows that unfolded, folded or slid since
 * then are somewhere else by now, and a remembered position made them jump back by that much and
 * slide down again. In the live in-flight table that happened whenever a request ended below the top
 * while a new one came in, and on the refresh after one that only added rows.
 *
 * offsetTop is relative to the table, so scrolling the grid does not count as moving. It renders
 * nothing; DataGrid draws it next to the body.
 */
export class RowSlide extends Component<RowSlideProps> {
  getSnapshotBeforeUpdate(previous: Readonly<RowSlideProps>): Tops | null {
    if (previous.order === this.props.order || this.props.reduceMotion) return null;
    return rowTops(this.props.bodyRef.current);
  }

  componentDidUpdate(_previous: Readonly<RowSlideProps>, _state: unknown, before: Tops | null): void {
    if (before && before.size > 0) slideRows(this.props.bodyRef.current, before);
  }

  render() {
    return null;
  }
}

function rowTops(body: HTMLTableSectionElement | null): Tops | null {
  if (!body) return null;
  const rows = body.querySelectorAll<HTMLElement>(":scope > tr[data-row-key]");
  return new Map([...rows].map((row) => [row.dataset.rowKey ?? "", row.offsetTop]));
}

function slideRows(body: HTMLTableSectionElement | null, before: Tops) {
  if (!body) return;
  const elements = [...body.querySelectorAll<HTMLElement>(":scope > tr[data-row-key]")];
  // Rows that were removed outright leave a gap the rows below jump into. Sliding them up from
  // below would draw the last row past the bottom of the table for a moment, and a grid whose
  // rows fit would flash a scrollbar. A live table folds a leaving row instead (useRowMotion).
  const shrank = elements.length < before.size;
  for (const element of elements) {
    if (element.dataset.entering || typeof element.animate !== "function") continue;
    const was = before.get(element.dataset.rowKey ?? "");
    if (was === undefined) continue;
    const delta = was - element.offsetTop;
    if (delta === 0 || Math.abs(delta) > MAX_SLIDE_PX || (shrank && delta > 0)) continue;
    const frames = [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }];
    const timing = { duration: SLIDE_MS, easing: SLIDE_EASING };
    element.animate(frames, timing);
    const detail = element.nextElementSibling;
    if (detail instanceof HTMLElement && detail.dataset.gridDetail !== undefined) detail.animate(frames, timing);
  }
}
