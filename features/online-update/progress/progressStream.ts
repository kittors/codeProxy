import {
  updateApi,
  type UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";

/**
 * Transport for update progress.
 *
 * The hard constraint this is built around: the event stream is served by the
 * application container, and applying an update recreates that container. The
 * stream is therefore *guaranteed* to drop partway through every update, at the
 * exact moment the most interesting transitions happen. A disconnect here is
 * normal progress, not an error.
 *
 * The previous implementation treated it as an error and backed off 5s → 10s → 20s
 * → 40s → 60s. A restart takes roughly a minute, so by the time the API was back the
 * next attempt was often another minute away; the modal froze and then reported a
 * timeout on updates that had actually succeeded.
 *
 * Three things fix that:
 *   1. Reconnect fast and keep reconnecting — sub-second, capped at a few seconds.
 *   2. Poll /update/progress while the stream is down, so progress keeps moving even
 *      if the stream never comes back (a buffering proxy, for instance).
 *   3. Resume from the last event id so the reconnect delivers what was missed
 *      instead of dropping the client into a hole.
 */

/** Reconnect delays. Deliberately aggressive: the server being gone is expected. */
const RECONNECT_BASE_MS = 300;
const RECONNECT_FACTOR = 1.6;
const RECONNECT_MAX_MS = 3000;
const RECONNECT_JITTER = 0.25;

/** Poll cadence while the stream is unavailable. */
const POLL_INTERVAL_MS = 2000;

/**
 * How long the transport may be out of contact before it stops claiming an update
 * is merely restarting. This replaces the old fixed 180s run timeout, which failed
 * slow-but-healthy updates: a large image pull on a small host legitimately exceeds
 * any wall-clock budget, so staleness is measured from the last contact rather than
 * from the start of the run.
 */
const CONTACT_STALE_MS = 90_000;

export type UpdateLinkState =
  /** Receiving events. */
  | "live"
  /** Not receiving events, but polling is still answering. */
  | "polling"
  /** Neither works. During an update this is the expected container restart. */
  | "reconnecting";

export interface UpdateProgressSnapshot {
  progress: UpdateProgressResponse | null;
  link: UpdateLinkState;
  /** Milliseconds since the updater was last reached, or null if never. */
  staleForMs: number | null;
  /** True once out of contact long enough that something is likely wrong. */
  stale: boolean;
}

type Listener = (snapshot: UpdateProgressSnapshot) => void;

const listeners = new Set<Listener>();

let controller: AbortController | null = null;
let running: Promise<void> | null = null;
/**
 * Incremented on every teardown. The stream loop captures the value it started
 * with and exits once it no longer matches, so a torn-down loop can neither
 * resurrect itself nor clobber the state of a stream started after it.
 */
let generation = 0;
let pollTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

let latest: UpdateProgressResponse | null = null;
let lastEventId: number | null = null;
let link: UpdateLinkState = "reconnecting";
let lastContactAt: number | null = null;

const now = () => Date.now();

const snapshot = (): UpdateProgressSnapshot => {
  const staleForMs = lastContactAt === null ? null : now() - lastContactAt;
  return {
    progress: latest,
    link,
    staleForMs,
    stale: staleForMs !== null && staleForMs > CONTACT_STALE_MS,
  };
};

const emit = () => {
  const value = snapshot();
  listeners.forEach((listener) => listener(value));
};

/**
 * Records progress, ignoring anything older than what is already held.
 *
 * Ordering is not guaranteed once polling and streaming run concurrently: a poll
 * issued during a reconnect can land after the stream has already delivered a newer
 * event. Without this guard the bar would visibly jump backwards.
 */
const accept = (progress: UpdateProgressResponse, source: UpdateLinkState) => {
  lastContactAt = now();
  link = source;

  const incomingId = typeof progress.event_id === "number" ? progress.event_id : null;
  if (incomingId !== null && lastEventId !== null && incomingId < lastEventId) {
    // Stale by event id, but contact was still made — the link state above stands.
    emit();
    return;
  }
  if (incomingId !== null) lastEventId = incomingId;
  latest = progress;
  emit();
};

const reconnectDelay = (attempt: number) => {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * RECONNECT_FACTOR ** Math.max(0, attempt));
  // Jitter keeps several open tabs from retrying in lockstep against a container
  // that is still coming up.
  const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });

/**
 * Polls once. Failures are silent: while the application container is being
 * recreated every request fails, and that is the expected path, not an incident.
 */
const pollOnce = async (signal: AbortSignal) => {
  try {
    const progress = await updateApi.progress({ signal });
    if (!signal.aborted) accept(progress, link === "live" ? "live" : "polling");
  } catch {
    if (!signal.aborted && link !== "live") {
      link = "reconnecting";
      emit();
    }
  }
};

const startPolling = (signal: AbortSignal) => {
  const tick = async () => {
    if (signal.aborted) return;
    // Polling only covers the gap; while the stream is healthy it would be noise.
    if (link !== "live") await pollOnce(signal);
    if (!signal.aborted) pollTimer = globalThis.setTimeout(tick, POLL_INTERVAL_MS);
  };
  pollTimer = globalThis.setTimeout(tick, POLL_INTERVAL_MS);
};

const stopPolling = () => {
  if (pollTimer !== null) {
    globalThis.clearTimeout(pollTimer);
    pollTimer = null;
  }
};

const ensureStream = () => {
  if (running || listeners.size === 0) return;

  const abort = new AbortController();
  const myGeneration = generation;
  controller = abort;
  const { signal } = abort;

  // Fetch current state immediately rather than waiting for the first event, so a
  // panel opened mid-update renders real progress instead of an empty modal.
  void pollOnce(signal);
  startPolling(signal);

  running = (async () => {
    let attempt = 0;
    while (!signal.aborted && listeners.size > 0 && generation === myGeneration) {
      let received = false;
      try {
        await updateApi.events(
          (progress) => {
            received = true;
            attempt = 0;
            accept(progress, "live");
          },
          {
            signal,
            // Resume rather than restart, so the reconnect delivers the transitions
            // that happened while the container was being replaced.
            params: lastEventId === null ? undefined : { last_event_id: String(lastEventId) },
          },
        );
      } catch {
        // Expected whenever the application container is recreated.
      }
      if (signal.aborted || listeners.size === 0 || generation !== myGeneration) break;

      if (!received && link === "live") {
        link = "reconnecting";
        emit();
      }
      await sleep(reconnectDelay(attempt), signal);
      attempt += 1;
    }
  })().finally(() => {
    if (generation !== myGeneration) return;
    if (controller === abort) controller = null;
    running = null;
    if (listeners.size > 0) ensureStream();
  });
};

const teardown = () => {
  generation += 1;
  stopPolling();
  controller?.abort();
  controller = null;
  running = null;
  latest = null;
  lastEventId = null;
  lastContactAt = null;
  link = "reconnecting";
};

/** Subscribes to update progress. Returns an unsubscribe function. */
export const subscribeUpdateProgress = (listener: Listener) => {
  listeners.add(listener);
  const current = snapshot();
  if (current.progress) queueMicrotask(() => listener(current));
  ensureStream();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardown();
  };
};

/** Forces an immediate refresh, used right after triggering an update. */
export const refreshUpdateProgress = () => {
  if (controller) void pollOnce(controller.signal);
};

/** Test seam: resets module state between cases. */
export const __resetUpdateProgressStream = () => {
  listeners.clear();
  teardown();
};
