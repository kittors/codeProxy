import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

/**
 * How long a row that left a live table stays drawn: it fades in place (160ms), then its height
 * folds to nothing (200ms) and the rows below follow it up. Matches DataGrid.css.
 */
export const ROW_LEAVE_MS = 360;
const SLIDE_MS = 320;
const SLIDE_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
/** A slide across most of a screen reads as the table jumping, not moving; such rows just land. */
const MAX_SLIDE_PX = 1600;

export interface RowMotion<T> {
  /** The rows to draw: the current ones plus, in a live table, the ones still fading out. */
  rows: readonly T[];
  /** Rows that appeared in this update. Only these play the entrance. */
  entering: ReadonlySet<string>;
  /** A whole new set of rows (first load, another page or filter) enters one by one; a live update does not. */
  stagger: boolean;
  /** Rows that left a live table and are fading out. */
  leaving: ReadonlySet<string>;
}

interface Leaving<T> {
  key: string;
  row: T;
  /** Keys around it in the previous order, to put it back where it was while it fades. */
  before: readonly string[];
}

interface Transition<T> {
  entering: ReadonlySet<string>;
  stagger: boolean;
  leaving: readonly Leaving<T>[];
}

const NONE: ReadonlySet<string> = new Set();
const NO_ROWS: readonly never[] = [];

/**
 * How the rows of a grid move when its data changes.
 *
 * Only rows that are new play the entrance. Rows that stay slide from where they were to where they
 * are now (FLIP), so a request that starts at the top pushes the older ones down instead of the
 * whole table flashing. The body used to be keyed by the set of row keys, which remounted every
 * row, and replayed every entrance, whenever one row came or went. A refreshing table such as the
 * in-flight requests then blinked on every poll.
 *
 * A set that shares no row with the previous one (first load, another page, another filter) still
 * enters row by row. In a live table (`live`) a row that leaves fades out in place first, and the
 * rows below close the gap after it. With reduced motion nothing animates and rows leave at once.
 */
export function useRowMotion<T>({
  rows,
  keys,
  rowKey,
  bodyRef,
  live,
  reduceMotion,
}: {
  rows: readonly T[];
  keys: readonly string[];
  rowKey: (row: T) => string;
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  live: boolean;
  reduceMotion: boolean;
}): RowMotion<T> {
  const committed = useRef<{ keys: readonly string[]; rows: readonly T[] } | null>(null);
  const signature = keys.join("\u0001");

  // Worked out once per change of the key list, against what the last commit drew.
  const transition = useMemo<Transition<T>>(() => {
    const previous = committed.current;
    if (!previous) return { entering: new Set(keys), stagger: true, leaving: [] };
    const before = new Set(previous.keys);
    if (!keys.some((key) => before.has(key))) {
      return { entering: new Set(keys), stagger: true, leaving: [] };
    }
    const now = new Set(keys);
    const leaving: Leaving<T>[] = [];
    if (live && !reduceMotion) {
      previous.keys.forEach((key, index) => {
        if (!now.has(key)) {
          leaving.push({ key, row: previous.rows[index], before: previous.keys.slice(0, index) });
        }
      });
    }
    return { entering: new Set(keys.filter((key) => !before.has(key))), stagger: false, leaving };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one transition per key list
  }, [signature, live, reduceMotion]);

  useLayoutEffect(() => {
    committed.current = { keys, rows };
  }, [keys, rows]);

  // A fading row stays drawn for ROW_LEAVE_MS, then the rows below slide up into its place.
  const [faded, setFaded] = useState<Transition<T> | null>(null);
  useEffect(() => {
    if (transition.leaving.length === 0) return undefined;
    const timer = window.setTimeout(() => setFaded(transition), ROW_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [transition]);
  const leaving = faded === transition ? NO_ROWS : transition.leaving;

  const drawn = useMemo(() => withLeavingRows(rows, keys, leaving), [rows, keys, leaving]);
  const leavingKeys = useMemo(
    () => (leaving.length === 0 ? NONE : new Set(leaving.map((entry) => entry.key))),
    [leaving],
  );

  useRowSlide(bodyRef, drawn, rowKey, reduceMotion);

  return { rows: drawn, entering: transition.entering, stagger: transition.stagger, leaving: leavingKeys };
}

/**
 * Puts each fading row back after the nearest row that was above it and is still drawn, or at the
 * top when none is: a row that left from under a new top row stays under it.
 */
function withLeavingRows<T>(rows: readonly T[], keys: readonly string[], leaving: readonly Leaving<T>[]): readonly T[] {
  if (leaving.length === 0) return rows;
  const out = rows.map((row, index) => ({ key: keys[index], row }));
  for (const entry of leaving) {
    let at = 0;
    for (let i = entry.before.length - 1; i >= 0; i--) {
      const found = out.findIndex((item) => item.key === entry.before[i]);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    out.splice(at, 0, { key: entry.key, row: entry.row });
  }
  return out.map((item) => item.row);
}

/**
 * FLIP: after each change of the drawn rows, every row that was already there slides from its old
 * offset to its new one, its expanded detail row with it. offsetTop is relative to the table, so
 * scrolling the grid does not count as moving. Rows that are entering have their own animation.
 */
function useRowSlide<T>(
  bodyRef: RefObject<HTMLTableSectionElement | null>,
  drawn: readonly T[],
  rowKey: (row: T) => string,
  reduceMotion: boolean,
) {
  const tops = useRef<Map<string, number>>(new Map());
  const signature = useMemo(() => drawn.map(rowKey).join("\u0001"), [drawn, rowKey]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const elements = [...body.querySelectorAll<HTMLElement>(":scope > tr[data-row-key]")];
    const next = new Map(elements.map((element) => [element.dataset.rowKey ?? "", element.offsetTop]));
    const previous = tops.current;
    tops.current = next;
    for (const element of elements) {
      if (element.dataset.leaving === "true") measureLeavingRow(element);
      // A key that came back before it finished leaving drops the stale measure.
      else if (element.style.getPropertyValue("--leave-h")) element.style.removeProperty("--leave-h");
    }
    if (reduceMotion || previous.size === 0) return;
    // Rows that were removed outright leave a gap the rows below jump into. Sliding them up from
    // below would draw the last row past the bottom of the table for a moment, and a grid whose
    // rows fit would flash a scrollbar. A live table folds a leaving row instead (see above).
    const shrank = elements.length < previous.size;
    for (const element of elements) {
      if (element.dataset.entering === "true" || typeof element.animate !== "function") continue;
      const before = previous.get(element.dataset.rowKey ?? "");
      if (before === undefined) continue;
      const delta = before - element.offsetTop;
      if (delta === 0 || Math.abs(delta) > MAX_SLIDE_PX || (shrank && delta > 0)) continue;
      const frames = [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }];
      const timing = { duration: SLIDE_MS, easing: SLIDE_EASING };
      element.animate(frames, timing);
      const detail = element.nextElementSibling;
      if (detail instanceof HTMLElement && detail.dataset.gridDetail !== undefined) detail.animate(frames, timing);
    }
  }, [bodyRef, reduceMotion, signature]);
}

/**
 * Writes a leaving row's height and each cell's content height into the custom properties its
 * collapse animation starts from (DataGrid.css): a keyframe cannot start from an auto height.
 */
function measureLeavingRow(row: HTMLElement) {
  if (row.style.getPropertyValue("--leave-h")) return;
  row.style.setProperty("--leave-h", `${row.offsetHeight}px`);
  for (const inner of row.querySelectorAll<HTMLElement>("[data-cell-inner]")) {
    inner.style.setProperty("--leave-inner-h", `${inner.offsetHeight}px`);
  }
}
