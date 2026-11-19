import { useSyncExternalStore } from "react";

/*
 * One shared one-second clock for the monitor's running durations. Each duration on screen reads it
 * and re-renders on the same tick, so only those few text nodes change every second: the table
 * around them keeps its columns and rows and does not re-render. Nothing ticks while nobody listens.
 */
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const idle = () => () => {};
const read = () => now;

/** Date.now(), refreshed every second while `running`; it holds still otherwise (a hidden page). */
export function useLiveNow(running: boolean): number {
  return useSyncExternalStore(running ? subscribe : idle, read, read);
}
