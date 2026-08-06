import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  apiKeyEntriesApi,
  detectApiBaseFromLocation,
  normalizeApiBase,
} from "@code-proxy/api-client";
import type { ModelItem } from "../types";

type ApiKeyEntry = Awaited<ReturnType<typeof apiKeyEntriesApi.list>>[number];

/**
 * Prefer keys whose allowed-channels pin the selected channel; fall back to
 * unrestricted keys. Returns a negative score for keys that cannot reach it.
 */
function scoreKeyForChannel(entry: ApiKeyEntry, channelNeedle: string): number {
  const allowed = (entry["allowed-channels"] ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return 1;
  if (!allowed.includes(channelNeedle)) return -1;
  // Exact single-channel restriction is the strongest pin available without a dedicated test API.
  return allowed.length === 1 ? 3 : 2;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") return error;
    return (payload as { error?: { message?: string } }).error?.message ?? fallback;
  }
  return fallback;
}

function extractResponseContent(payload: unknown): string {
  if (payload && typeof payload === "object" && Array.isArray((payload as { choices?: unknown }).choices)) {
    const choice = (payload as { choices: Array<{ message?: { content?: unknown } }> }).choices[0];
    const text = choice?.message?.content;
    if (typeof text === "string") return text;
    return JSON.stringify(payload, null, 2);
  }
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}

/** Owns the "test this model" modal state and its one-shot chat completion call. */
export function useModelTestRunner(apiBase?: string) {
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
      // Only the upstream round-trip is timed; the local API-key lookup would
      // otherwise inflate the number the user reads as model latency.
      let requestStartedAt: number | null = null;
      try {
        const entries = await apiKeyEntriesApi.list();
        const channelNeedle = input.channel.trim().toLowerCase();
        const matchingKey =
          entries
            .filter((entry) => !entry.disabled && entry.key?.trim())
            .map((entry) => ({ entry, score: scoreKeyForChannel(entry, channelNeedle) }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.entry ?? null;
        if (!matchingKey) {
          throw new Error(t("models_page.test_no_api_key"));
        }

        const base = normalizeApiBase(apiBase || detectApiBaseFromLocation());
        requestStartedAt = performance.now();
        const response = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${matchingKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: target.id,
            messages: [{ role: "user", content: input.prompt }],
            stream: false,
          }),
        });
        const rawText = await response.text();
        let payload: unknown = null;
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          payload = rawText;
        }
        if (!response.ok) {
          throw new Error(extractErrorMessage(payload, rawText || `HTTP ${response.status}`));
        }
        setResultText(extractResponseContent(payload) || t("models_page.test_empty_response"));
      } catch (err: unknown) {
        setErrorText(err instanceof Error ? err.message : t("models_page.test_failed"));
      } finally {
        // Failed round-trips still carry a useful timing; pre-request failures do not.
        if (requestStartedAt !== null) {
          setDurationMs(Math.round(performance.now() - requestStartedAt));
        }
        setRunning(false);
      }
    },
    [apiBase, t, target],
  );

  return { target, running, resultText, errorText, durationMs, open, close, run };
}
