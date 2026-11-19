import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

/** A row that leaves a live table first fades where it is, this long. Matches DataGrid.css. */
export const ROW_FADE_MS = 160;
/**
 * Its fold starts this soon: the fade starts fast and is at 2% by then, so the row is already gone
 * to the eye. Waiting for the whole fade left an empty gap standing still for a moment.
 */
export const ROW_FOLD_AFTER_MS = 120;
/** A row folds to nothing, and an entering row unfolds, over this long. Matches DataGrid.css. */
export const ROW_FOLD_MS = 280;
/** How long a row that left a live table on its own stays drawn: it fades, then folds. */
export const ROW_LEAVE_MS = ROW_FOLD_AFTER_MS + ROW_FOLD_MS;
/** Rows that come or go in the same update take turns, this far apart... */
export const LIVE_TURN_MS = 80;
/** ...and a large burst squeezes its turns into this window, so it does not drag on. */
export const LIVE_TURNS_WITHIN_MS = 480;

export interface RowMotion<T> {
  /** The rows to draw: the current ones plus, in a live table, the ones still fading out. */
  rows: readonly T[];
  /** The keys of the drawn rows, in order and joined. */
  order: string;
  /** Rows that appeared in this update. Only these play the entrance. */
  entering: ReadonlySet<string>;
  /** A whole new set of rows (first load, another page or filter) enters one by one; a live update does not. */
  stagger: boolean;
  /** Rows that left a live table and are fading out. */
  leaving: ReadonlySet<string>;
  /**
   * A live update: entering rows unfold from no height while leaving rows fold, so one request
   * replacing another keeps the table, and everything under it, still (DataGrid.css).
   */
  unfold: boolean;
  /** In a live update, when each entering row starts to unfold and each leaving row to fold, in ms. */
  delays: ReadonlyMap<string, number>;
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
  delays: ReadonlyMap<string, number>;
  /** When the last leaving row has folded and can go. */
  settleMs: number;
}

const NONE: ReadonlySet<string> = new Set();
const NO_ROWS: readonly never[] = [];
const NO_DELAYS: ReadonlyMap<string, number> = new Map();

/**
 * How the rows of a grid move when its data changes.
 *
 * Only rows that are new play the entrance. Rows that stay slide from where they were to where they
 * are now (RowSlide). The body used to be keyed by the set of row keys, which remounted every row,
 * and replayed every entrance, whenever one row came or went. A refreshing table such as the
 * in-flight requests then blinked on every poll.
 *
 * A set that shares no row with the previous one (first load, another page, another filter) still
 * enters row by row. In a live table (`live`) a row that leaves fades out in place first, and the
 * rows below close the gap after it. With reduced motion nothing animates and rows leave at once.
 */
export function useRowMotion<T>({
  rows,
  keys,
  bodyRef,
  live,
  reduceMotion,
}: {
  rows: readonly T[];
  keys: readonly string[];
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  live: boolean;
  reduceMotion: boolean;
}): RowMotion<T> {
  const committed = useRef<{ keys: readonly string[]; rows: readonly T[] } | null>(null);
  const signature = keys.join("\u0001");

  // Worked out once per change of the key list, against what the last commit drew.
  const transition = useMemo<Transition<T>>(() => {
    const previous = committed.current;
    if (!previous) return wholeSet(keys);
    const before = new Set(previous.keys);
    if (!keys.some((key) => before.has(key))) return wholeSet(keys);
    const entering = keys.filter((key) => !before.has(key));
    if (!live || reduceMotion) {
      return { entering: new Set(entering), stagger: false, leaving: [], delays: NO_DELAYS, settleMs: 0 };
    }
    const now = new Set(keys);
    const leaving: Leaving<T>[] = [];
    previous.keys.forEach((key, index) => {
      if (!now.has(key)) leaving.push({ key, row: previous.rows[index], before: previous.keys.slice(0, index) });
    });
    return {
      entering: new Set(entering),
      stagger: false,
      leaving,
      ...liveTurns(
        entering,
        leaving.map((entry) => entry.key),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one transition per key list
  }, [signature, live, reduceMotion]);

  useLayoutEffect(() => {
    committed.current = { keys, rows };
  }, [keys, rows]);

  // Fading rows stay drawn until the last of them has folded, then they go.
  const [faded, setFaded] = useState<Transition<T> | null>(null);
  useEffect(() => {
    if (transition.leaving.length === 0) return undefined;
    const timer = window.setTimeout(() => setFaded(transition), transition.settleMs);
    return () => window.clearTimeout(timer);
  }, [transition]);
  const leaving = faded === transition ? NO_ROWS : transition.leaving;

  const drawn = useMemo(() => withLeavingRows(rows, keys, leaving), [rows, keys, leaving]);
  const leavingKeys = useMemo(
    () => (leaving.length === 0 ? NONE : new Set(leaving.map((entry) => entry.key))),
    [leaving],
  );
  const order = drawn.keys.join("\u0001");

  // A keyframe cannot fold from or unfold to an auto height: the rows that start to leave or to
  // unfold at this commit get their heights measured before anything is painted. Run for each
  // update, not only when the drawn order changes: rows that only leave stay where they were, so
  // the order is the same, and unmeasured they dropped to their content height in one frame (the
  // rows below jumped up ~11px each), then held still before folding.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    for (const element of body.querySelectorAll<HTMLElement>(":scope > tr[data-row-key]")) {
      if (element.dataset.leaving === "true") measureLeavingRow(element);
      // A key that came back before it finished leaving drops the stale measure.
      else if (element.style.getPropertyValue("--leave-h")) element.style.removeProperty("--leave-h");
      if (element.dataset.entering === "live") measureUnfoldingRow(element);
      else if (element.style.getPropertyValue("--enter-h")) element.style.removeProperty("--enter-h");
    }
  }, [bodyRef, order, transition]);

  return {
    rows: drawn.rows,
    order,
    entering: transition.entering,
    stagger: transition.stagger,
    leaving: leavingKeys,
    unfold: live && !transition.stagger && !reduceMotion,
    delays: transition.delays,
  };
}

function wholeSet<T>(keys: readonly string[]): Transition<T> {
  return { entering: new Set(keys), stagger: true, leaving: [], delays: NO_DELAYS, settleMs: 0 };
}

/**
 * When each row of a live update folds or unfolds. Rows take turns, so a burst of new requests
 * lands one at a time and the table grows a few pixels a frame instead of a block in one go.
 *
 * - New rows unfold from the bottom one up: the oldest of them first, right on top of the rows that
 *   were there, then each newer one on top of it, as if they had come in one after another.
 * - Leaving rows fade together first, so the update reads at once, then fold in turn from the top,
 *   starting as the fade is all but done.
 * - The k-th fold runs with the k-th unfold: one request replacing another keeps the table's height.
 * - With nothing leaving, nothing waits for a fade: the new rows start to unfold at once.
 */
function liveTurns(entering: readonly string[], leaving: readonly string[]) {
  const turns = Math.max(entering.length, leaving.length);
  const turn = turns > 1 ? Math.min(LIVE_TURN_MS, LIVE_TURNS_WITHIN_MS / (turns - 1)) : 0;
  const start = leaving.length > 0 ? ROW_FOLD_AFTER_MS : 0;
  const delays = new Map<string, number>();
  entering.forEach((key, index) => delays.set(key, Math.round(start + (entering.length - 1 - index) * turn)));
  leaving.forEach((key, index) => delays.set(key, Math.round(start + index * turn)));
  const settleMs = leaving.length > 0 ? Math.round(start + (leaving.length - 1) * turn) + ROW_FOLD_MS : 0;
  return { delays, settleMs };
}

/**
 * Puts each fading row back after the nearest row that was above it and is still drawn, or at the
 * top when none is: a row that left from under a new top row stays under it.
 */
function withLeavingRows<T>(
  rows: readonly T[],
  keys: readonly string[],
  leaving: readonly Leaving<T>[],
): { rows: readonly T[]; keys: readonly string[] } {
  if (leaving.length === 0) return { rows, keys };
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
  return { rows: out.map((item) => item.row), keys: out.map((item) => item.key) };
}

/**
 * Writes a leaving row's height and each cell's content height into the custom properties its
 * collapse animation starts from (DataGrid.css). Fractional heights, so nothing snaps by a pixel
 * when the fold starts.
 */
function measureLeavingRow(row: HTMLElement) {
  if (row.style.getPropertyValue("--leave-h")) return;
  row.style.setProperty("--leave-h", `${row.getBoundingClientRect().height}px`);
  for (const inner of row.querySelectorAll<HTMLElement>("[data-cell-inner]")) {
    inner.style.setProperty("--leave-inner-h", `${inner.getBoundingClientRect().height}px`);
  }
}

/**
 * A row entering a live table starts folded (height 0, DataGrid.css) and unfolds to its own height,
 * which the keyframe needs as a number. Folded, the row cannot report it, so its animations are
 * switched off for the measurement and back on right after. Nothing is painted in between, and the
 * animations restart at their first frame, which is where they were. Measured once: doing it again
 * mid-unfold would restart the animation.
 */
function measureUnfoldingRow(row: HTMLElement) {
  if (row.style.getPropertyValue("--enter-h")) return;
  const inners = [...row.querySelectorAll<HTMLElement>("[data-cell-inner]")];
  const parts = [row, ...row.querySelectorAll<HTMLElement>(":scope > td"), ...inners];
  for (const part of parts) part.style.animation = "none";
  row.style.setProperty("--enter-h", `${row.getBoundingClientRect().height}px`);
  for (const inner of inners) inner.style.setProperty("--enter-inner-h", `${inner.getBoundingClientRect().height}px`);
  for (const part of parts) part.style.animation = "";
}
