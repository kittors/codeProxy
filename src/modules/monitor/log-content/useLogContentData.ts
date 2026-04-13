import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@/lib/http/apis";
import type { LogContentModalProps } from "./types";

export function useLogContentData({
  open,
  logId,
  initialTab,
  fetchFn,
  fetchPartFn,
}: Pick<LogContentModalProps, "open" | "logId" | "initialTab" | "fetchFn" | "fetchPartFn">) {
  const { t } = useTranslation();
  const resolvedInitialTab = initialTab ?? "input";
  const [inputLoading, setInputLoading] = useState(false);
  const [outputLoading, setOutputLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [inputContent, setInputContent] = useState("");
  const [outputContent, setOutputContent] = useState("");
  const [model, setModel] = useState("");
  const abortRef = useRef<{ input: AbortController | null; output: AbortController | null }>({
    input: null,
    output: null,
  });

  const fetchPart = useCallback(
    async (id: number, part: "input" | "output", opts?: { prefetch?: boolean }) => {
      const controller = new AbortController();
      const prev = abortRef.current[part];
      if (prev) prev.abort();
      abortRef.current[part] = controller;

      const setLoading = part === "input" ? setInputLoading : setOutputLoading;
      const setError = part === "input" ? setInputError : setOutputError;
      const setContent = part === "input" ? setInputContent : setOutputContent;

      setLoading(true);
      if (!opts?.prefetch) setError(null);

      try {
        const result = fetchPartFn
          ? await fetchPartFn(id, part, { signal: controller.signal })
          : fetchFn
            ? await fetchFn(id)
            : await usageApi.getLogContentPart(id, part, {
                signal: controller.signal,
                timeoutMs: 60_000,
              });

        const record = result as Record<string, unknown>;
        if (typeof record.content === "string") {
          setContent(record.content || "");
          setModel(typeof record.model === "string" ? record.model : "");
          return;
        }

        const input = typeof record.input_content === "string" ? record.input_content : "";
        const output = typeof record.output_content === "string" ? record.output_content : "";
        setContent(part === "input" ? input : output);
        setModel(typeof record.model === "string" ? record.model : "");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (opts?.prefetch) return;
        setError(err instanceof Error ? err.message : t("error_detail.load_failed"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [fetchFn, fetchPartFn, t],
  );

  useEffect(() => {
    if (!open || !logId) return;

    setInputContent("");
    setOutputContent("");
    setModel("");
    setInputError(null);
    setOutputError(null);
    setInputLoading(false);
    setOutputLoading(false);

    let cancelled = false;
    void fetchPart(logId, resolvedInitialTab).then(() => {
      if (cancelled) return;
      const other = resolvedInitialTab === "input" ? "output" : "input";
      window.setTimeout(() => {
        if (!cancelled) void fetchPart(logId, other, { prefetch: true });
      }, 500);
    });

    return () => {
      cancelled = true;
      abortRef.current.input?.abort();
      abortRef.current.output?.abort();
      abortRef.current.input = null;
      abortRef.current.output = null;
      setInputLoading(false);
      setOutputLoading(false);
    };
  }, [open, logId, resolvedInitialTab, fetchPart]);

  return {
    inputLoading,
    outputLoading,
    inputError,
    outputError,
    inputContent,
    outputContent,
    model,
    fetchPart,
  };
}
