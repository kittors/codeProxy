import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { modelsApi } from "@code-proxy/api-client";
import type { ModelItem } from "../types";

/**
 * Owns the "test this model" modal state and its one-shot probe.
 *
 * The probe runs server-side with management authority. It used to run from the
 * browser: list the tenant's API keys, pick one, and call /v1/chat/completions
 * with it. That asked whether that particular business identity may use the
 * model — an operator checking a healthy account got "no auth available"
 * because the key it happened to pick was bound to an end user restricted to
 * one channel group, which no account-side configuration could fix.
 */
export function useModelTestRunner() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<ModelItem | null>(null);
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const open = useCallback((model: ModelItem) => {
    setTarget(model);
    setResultText(null);
    setErrorText(null);
    setDurationMs(null);
  }, []);

  const close = useCallback(() => {
    if (running) return;
    setTarget(null);
    setResultText(null);
    setErrorText(null);
    setDurationMs(null);
  }, [running]);

  const run = useCallback(
    async (input: { channel: string; prompt: string }) => {
      if (!target) return;
      setRunning(true);
      setResultText(null);
      setErrorText(null);
      setDurationMs(null);
      try {
        const result = await modelsApi.testModel({
          model: target.id,
          prompt: input.prompt,
          channel: input.channel,
        });
        // The upstream duration is measured server-side, around the execution
        // only, so it is not inflated by the panel's own round trip.
        if (typeof result.duration_ms === "number") {
          setDurationMs(result.duration_ms);
        }
        if (!result.ok) {
          setErrorText(result.error || t("models_page.test_failed"));
          return;
        }
        setResultText(result.content || t("models_page.test_empty_response"));
      } catch (err: unknown) {
        setErrorText(err instanceof Error ? err.message : t("models_page.test_failed"));
      } finally {
        setRunning(false);
      }
    },
    [t, target],
  );

  return { target, running, resultText, errorText, durationMs, open, close, run };
}
