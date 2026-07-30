import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  updateApi,
  type UpdateCheckResponse,
  type UpdateProgressResponse,
} from "@code-proxy/api-client/endpoints/update";
import {
  refreshUpdateProgress,
  subscribeUpdateProgress,
  type UpdateLinkState,
} from "./progress/progressStream";
import {
  candidateFromProgress,
  isRunningProgress,
  isTerminalProgress,
  normalizedProgressStatus,
} from "./model/updateModel";

export interface OnlineUpdateState {
  /** What the modal renders: the live run if there is one, otherwise the check. */
  candidate: UpdateCheckResponse | null;
  progress: UpdateProgressResponse | null;
  link: UpdateLinkState;
  /** Out of contact long enough that the restart explanation no longer holds. */
  stale: boolean;
  checking: boolean;
  /** An update is in flight, whether this tab started it or not. */
  updating: boolean;
  completed: boolean;
  failed: boolean;
  error: string | null;
  open: boolean;
}

/**
 * Owns all online-update state for the app.
 *
 * Previously two components (the background prompt and the system page card) each
 * held their own copy of this state, each rendered their own modal, and they
 * coordinated through a module-global mutex to decide which modal was allowed to
 * appear. Moving or reusing either component broke that arrangement. There is now
 * one owner and one modal; the components consume it.
 */
export const useOnlineUpdate = ({ enabled }: { enabled: boolean }) => {
  const [candidate, setCandidate] = useState<UpdateCheckResponse | null>(null);
  const [progress, setProgress] = useState<UpdateProgressResponse | null>(null);
  const [link, setLink] = useState<UpdateLinkState>("reconnecting");
  const [stale, setStale] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const checkingRef = useRef(false);
  // Set once a run has been observed, so a completed status from an unrelated
  // earlier run does not pop the modal open on a fresh page load.
  const observedRunRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeUpdateProgress((snapshot) => {
      setLink(snapshot.link);
      setStale(snapshot.stale);

      const next = snapshot.progress;
      if (!next) return;
      const status = normalizedProgressStatus(next);
      if (status === "idle") {
        setProgress(null);
        return;
      }

      const runID = next.run_id ?? null;
      if (isRunningProgress(next)) {
        observedRunRef.current = runID;
        setProgress(next);
        setCandidate((current) => candidateFromProgress(next, current));
        // An update started elsewhere (another tab, another admin) still deserves
        // to be visible here rather than silently changing the running version.
        setOpen(true);
        return;
      }
      if (isTerminalProgress(next) && runID !== null && observedRunRef.current === runID) {
        setProgress(next);
        setCandidate((current) => candidateFromProgress(next, current));
        setApplying(false);
      }
    });
  }, [enabled]);

  const check = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (checkingRef.current) return null;
      checkingRef.current = true;
      if (!silent) {
        setChecking(true);
        setError(null);
      }
      try {
        const info = await updateApi.check();
        setCandidate(info);
        return info;
      } catch (cause: unknown) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (!silent) {
          setCandidate(null);
          setError(message);
        }
        throw cause;
      } finally {
        checkingRef.current = false;
        if (!silent) setChecking(false);
      }
    },
    [],
  );

  /**
   * Triggers the update and returns once it has been accepted.
   *
   * It deliberately does not wait for the run to finish. The old flow awaited a
   * terminal state behind a 180s timeout and reported failure when that expired —
   * but a large image pull on a modest host legitimately takes longer, so healthy
   * updates were being reported as failures. Completion now arrives through the
   * progress stream, which has no deadline because the updater persists its state.
   */
  const apply = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const response = await updateApi.apply();
      if (response.status?.trim().toLowerCase() === "noop") {
        setApplying(false);
        setCandidate((current) =>
          current ? { ...current, message: response.message, update_available: false } : current,
        );
        return { started: false as const, message: response.message };
      }
      if (typeof response.run_id === "number" && response.run_id > 0) {
        observedRunRef.current = response.run_id;
      }
      if (response.target) setCandidate(response.target);
      // Ask for state immediately so the console fills in without waiting for the
      // stream's next event.
      refreshUpdateProgress();
      return { started: true as const, message: response.message };
    } catch (cause: unknown) {
      setApplying(false);
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      throw cause;
    }
  }, []);

  const openModal = useCallback(() => setOpen(true), []);
  const closeModal = useCallback(() => {
    setOpen(false);
    setError(null);
    // Drop a finished run so reopening shows the current state rather than the
    // previous outcome. A run still in flight is kept: it is still true.
    setProgress((current) => (isTerminalProgress(current) ? null : current));
  }, []);

  const state = useMemo<OnlineUpdateState>(() => {
    const completed = normalizedProgressStatus(progress) === "completed";
    const failed = normalizedProgressStatus(progress) === "failed";
    return {
      candidate,
      progress,
      link,
      stale,
      checking,
      updating: (applying || isRunningProgress(progress)) && !completed && !failed,
      completed,
      failed,
      error,
      open,
    };
  }, [applying, candidate, checking, error, link, open, progress, stale]);

  return { state, check, apply, openModal, closeModal };
};
