import {
  updateApi,
  type UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";
import { isRunningProgress } from "../model/updateModel";

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
 *
 * All of that is right *during* an update and wrong the rest of the time, which is
 * almost always. Panels are left open for hours with nothing being updated, and on
 * a deployment without the updater sidecar every request fails: measured on a live
 * instance, one idle tab issued ~33 requests a minute forever — a 5s-timeout 502 on
 * every poll, plus a stream that answered 204 and was immediately reconnected. Each
 * failed poll also wrote an audit row, which is how the governance page ended up
 * holding 33k rows of update polling.
 *
 * So the cadence follows what is actually happening: fast while a run is in flight
 * (the case the aggressive reconnect exists for), slow and backing off when idle.
 */

/**
 * Reconnect delays while a run is in flight. Deliberately aggressive: the server
 * being gone is the expected path through an update.
 */
const RECONNECT_BASE_MS = 300;
const RECONNECT_FACTOR = 1.6;
const RECONNECT_MAX_MS = 3000;
const RECONNECT_JITTER = 0.25;

/**
 * Reconnect delays when no run is in flight. A stream that is not delivering while
 * nothing is happening is not an incident, and reconnecting at three per second
 * only costs the server.
 */
const IDLE_RECONNECT_BASE_MS = 3000;
const IDLE_RECONNECT_MAX_MS = 30_000;

/** Poll cadence while a run is in flight and the stream is not delivering. */
const POLL_INTERVAL_MS = 2000;

/**
 * Poll cadence when nothing is in flight, backing off while it keeps failing. The
 * ceiling still catches an update started elsewhere within half a minute or so of
 * a healthy endpoint answering.
 */
const IDLE_POLL_INTERVAL_MS = 30_000;
const IDLE_POLL_MAX_MS = 300_000;

/**
 * How long an explicit refresh keeps the fast cadence. It covers the window
 * between "apply accepted" and the first progress event, during which there is
 * nothing in `latest` to prove a run is in flight.
 */
const ACTIVE_HINT_MS = 5 * 60_000;

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
let activeHintUntil = 0;
let pollFailures = 0;
/**
 * Set when the server refuses the operator outright. Retrying cannot change a
 * permission decision, and it was those retries — one refusal every two seconds
 * from every open tab — that buried the audit log.
 */
let refused = false;

const now = () => Date.now();

/**
 * Whether an update is believed to be in flight. Everything that trades server
 * load for latency keys off this.
 */
const isActive = () => isRunningProgress(latest) || now() < activeHintUntil;

/** Reads a status off an unknown rejection without depending on the error class. */
const statusOf = (error: unknown): number =>
  typeof (error as { status?: unknown } | null)?.status === "number"
    ? (error as { status: number }).status
    : 0;

const isRefusal = (error: unknown) => statusOf(error) === 403;

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
  const [start, ceiling] = isActive()
    ? [RECONNECT_BASE_MS, RECONNECT_MAX_MS]
    : [IDLE_RECONNECT_BASE_MS, IDLE_RECONNECT_MAX_MS];
  const base = Math.min(ceiling, start * RECONNECT_FACTOR ** Math.max(0, attempt));
  // Jitter keeps several open tabs from retrying in lockstep against a container
  // that is still coming up.
  const jitter = base * RECONNECT_JITTER * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
};

/**
 * Delay before the next poll. While a run is in flight this is the old fixed
 * cadence; otherwise it starts slow and doubles for as long as the endpoint keeps
 * failing, which is the shape of a deployment with no updater sidecar.
 */
const pollDelay = () => {
  if (isActive()) return POLL_INTERVAL_MS;
  return Math.min(IDLE_POLL_MAX_MS, IDLE_POLL_INTERVAL_MS * 2 ** Math.min(pollFailures, 8));
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
    pollFailures = 0;
    if (!signal.aborted) accept(progress, link === "live" ? "live" : "polling");
  } catch (error: unknown) {
    if (signal.aborted) return;
    if (isRefusal(error)) {
      stopTransport();
      return;
    }
    pollFailures += 1;
    if (link !== "live") {
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
    if (!signal.aborted && !refused) pollTimer = globalThis.setTimeout(tick, pollDelay());
  };
  pollTimer = globalThis.setTimeout(tick, pollDelay());
};

const stopPolling = () => {
  if (pollTimer !== null) {
    globalThis.clearTimeout(pollTimer);
    pollTimer = null;
  }
};

/**
 * Stops the transport without dropping subscribers, so a refused operator keeps
 * whatever state was already rendered instead of watching it reset.
 */
const stopTransport = () => {
  refused = true;
  generation += 1;
  stopPolling();
  controller?.abort();
  controller = null;
  running = null;
};

const ensureStream = () => {
  if (running || listeners.size === 0 || refused) return;

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
      } catch (error: unknown) {
        // Expected whenever the application container is recreated — unless the
        // server refused the operator, which no amount of reconnecting fixes.
        if (isRefusal(error)) {
          stopTransport();
          break;
        }
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
  activeHintUntil = 0;
  pollFailures = 0;
  // Cleared with the rest of the state: the next subscriber may be a different
  // session, and a sign-in with the permission must not inherit the refusal.
  refused = false;
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

/**
 * Forces an immediate refresh, used right after triggering an update. It also
 * arms the fast cadence: the run has been accepted but nothing has reported it
 * yet, so `latest` cannot prove anything is in flight.
 */
export const refreshUpdateProgress = () => {
  activeHintUntil = now() + ACTIVE_HINT_MS;
  if (controller) {
    void pollOnce(controller.signal);
    // The pending timer was scheduled at the idle cadence; reschedule so the next
    // poll lands two seconds from now rather than up to five minutes away.
    stopPolling();
    startPolling(controller.signal);
  }
};

/** Test seam: resets module state between cases. */
export const __resetUpdateProgressStream = () => {
  listeners.clear();
  teardown();
};
