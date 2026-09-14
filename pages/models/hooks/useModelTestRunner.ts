import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  modelTestApi,
  type ModelTestMode,
  type ModelTestOptions,
  type ModelTestRequest,
  type ModelTestResult,
} from "@code-proxy/api-client";
import type { ModelItem } from "../types";

/**
 * Owns the "test this model" modal state and its one-shot probe.
 *
 * Two things the older version got wrong, both fixed here:
 *
 * - It sent a chat completion for every model, so testing an image model asked
 *   the upstream to have a conversation with it and reported the resulting
 *   prose as a pass. The shape now comes from the model's supported modes.
 * - It expected one synchronous answer. Media probes run as tasks upstream —
 *   a clip takes minutes — so the runner polls when the server hands back a
 *   task id.
 */

// Poll cadence for a media task. Fast enough that a 30s image feels responsive,
// slow enough that an 8-minute clip is not hundreds of requests.
const POLL_INTERVAL_MS = 2000;

export interface ModelTestRunInput {
  channel: string;
  prompt: string;
  mode: ModelTestMode;
  images?: string[];
  size?: string;
  quality?: string;
  n?: number;
  duration?: number;
}

export function useModelTestRunner() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ModelItem | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ModelTestResult | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [options, setOptions] = useState<ModelTestOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Guards every async continuation: a probe whose modal was closed, or whose
  // target changed, must not write its result over the current one.
  const runToken = useRef(0);

  useEffect(() => {
    if (!target) {
      setOptions(null);
      return;
    }
    const token = ++runToken.current;
    setOptionsLoading(true);
    setOptions(null);
    void modelTestApi
      .getOptions(target.id)
      .then((loaded) => {
        if (runToken.current !== token) return;
        setOptions(loaded);
      })
      .catch(() => {
        // A model the server cannot describe still gets a usable form from the
        // modal's own fallback, so this is not surfaced as a failure.
        if (runToken.current !== token) return;
        setOptions(null);
      })
      .finally(() => {
        if (runToken.current !== token) return;
        setOptionsLoading(false);
      });
  }, [target]);

  const open = useCallback((model: ModelItem) => {
    runToken.current += 1;
    setTarget(model);
    setResult(null);
    setErrorText(null);
    setDurationMs(null);
    setPhase(null);
  }, []);

  const close = useCallback(() => {
    if (running) return;
    runToken.current += 1;
    setTarget(null);
    setResult(null);
    setErrorText(null);
    setDurationMs(null);
    setPhase(null);
  }, [running]);

  const run = useCallback(
    async (input: ModelTestRunInput) => {
      if (!target) return;
      const token = ++runToken.current;
      setRunning(true);
      setResult(null);
      setErrorText(null);
      setDurationMs(null);
      setPhase(null);

      const request: ModelTestRequest = {
        model: target.id,
        prompt: input.prompt,
        mode: input.mode,
        ...(input.channel ? { channel: input.channel } : {}),
        ...(input.images?.length ? { images: input.images } : {}),
        ...(input.size ? { size: input.size } : {}),
        ...(input.quality ? { quality: input.quality } : {}),
        ...(input.n && input.n > 1 ? { n: input.n } : {}),
        ...(input.duration ? { duration: input.duration } : {}),
      };

      try {
        let payload = await modelTestApi.run(request);
        if (payload.task_id) {
          payload = await pollTask(payload, token, runToken, setPhase, setResult);
        }
        if (runToken.current !== token) return;
        applyOutcome(payload, { setDurationMs, setErrorText, setResult, fallbackError: t("models_page.test_failed") });
      } catch (err: unknown) {
        if (runToken.current !== token) return;
        setErrorText(err instanceof Error ? err.message : t("models_page.test_failed"));
      } finally {
        if (runToken.current === token) {
          setRunning(false);
          setPhase(null);
        }
      }
    },
    [t, target],
  );

  return {
    target,
    running,
    result,
    errorText,
    durationMs,
    phase,
    options,
    optionsLoading,
    open,
    close,
    run,
    /** Everything ModelTestModal renders, so the page wires it in one spread. */
    modalProps: {
      model: target,
      running,
      result,
      errorText,
      durationMs,
      phase,
      options,
      onClose: close,
      onRun: (input: ModelTestRunInput) => void run(input),
    },
  };
}

/**
 * Polls a media task to completion.
 *
 * Interim snapshots are published as they arrive so the modal can show the
 * upstream phase ("queued", "generating") instead of an opaque spinner for the
 * minutes a clip takes.
 */
async function pollTask(
  started: ModelTestResult,
  token: number,
  runToken: { current: number },
  setPhase: (phase: string | null) => void,
  setResult: (result: ModelTestResult | null) => void,
): Promise<ModelTestResult> {
  const taskId = started.task_id;
  if (!taskId) return started;

  setPhase(started.phase ?? started.status ?? null);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (runToken.current !== token) return started;

    const snapshot = await modelTestApi.getTask(taskId);
    if (runToken.current !== token) return started;

    if (snapshot.status === "succeeded" || snapshot.status === "failed") {
      // The task response carries the request snapshot only on the initial
      // reply, so it is carried forward rather than lost on completion.
      return { ...snapshot, request: snapshot.request ?? started.request, mode: snapshot.mode ?? started.mode };
    }
    setPhase(snapshot.phase ?? snapshot.status ?? null);
    setResult({ ...snapshot, request: snapshot.request ?? started.request, mode: started.mode });
  }
}

function applyOutcome(
  payload: ModelTestResult,
  handlers: {
    setDurationMs: (value: number | null) => void;
    setErrorText: (value: string | null) => void;
    setResult: (value: ModelTestResult | null) => void;
    fallbackError: string;
  },
) {
  if (typeof payload.duration_ms === "number") {
    handlers.setDurationMs(payload.duration_ms);
  }
  // A failed probe still carries its request snapshot and whatever metadata the
  // server could read, which is the most useful part of a failure.
  handlers.setResult(payload);
  if (!payload.ok || payload.status === "failed") {
    handlers.setErrorText(payload.error || handlers.fallbackError);
  }
}
