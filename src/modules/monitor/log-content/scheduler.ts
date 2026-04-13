export type CancelFn = () => void;

export function scheduleIdle(cb: () => void, timeoutMs = 250): CancelFn {
  let cancelled = false;
  let handle: number | null = null;

  const run = () => {
    if (cancelled) return;
    cb();
  };

  const ric = (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback as
    | ((fn: () => void, opts?: { timeout?: number }) => number)
    | undefined;
  const cic = (window as unknown as { cancelIdleCallback?: unknown }).cancelIdleCallback as
    | ((id: number) => void)
    | undefined;

  if (ric) {
    handle = ric(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      if (handle !== null && cic) cic(handle);
      handle = null;
    };
  }

  handle = window.setTimeout(run, 0);
  return () => {
    cancelled = true;
    if (handle !== null) window.clearTimeout(handle);
    handle = null;
  };
}
