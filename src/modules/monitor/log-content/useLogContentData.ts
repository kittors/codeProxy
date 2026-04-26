import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usageApi } from "@/lib/http/apis";
import type { LogContentModalProps, LogContentPart } from "./types";

export function useLogContentData({
  open,
  logId,
  initialTab,
  fetchFn,
  fetchPartFn,
  fetchDetailsFn,
}: Pick<
  LogContentModalProps,
  "open" | "logId" | "initialTab" | "fetchFn" | "fetchPartFn" | "fetchDetailsFn"
>) {
  const { t } = useTranslation();
  const resolvedInitialTab = initialTab ?? "input";
  const [inputLoading, setInputLoading] = useState(false);
  const [outputLoading, setOutputLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [inputContent, setInputContent] = useState("");
  const [outputContent, setOutputContent] = useState("");
  const [detailsContent, setDetailsContent] = useState("");
  const [inputLoaded, setInputLoaded] = useState(false);
  const [outputLoaded, setOutputLoaded] = useState(false);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const [model, setModel] = useState("");
  const abortRef = useRef<{
    input: AbortController | null;
    output: AbortController | null;
    details: AbortController | null;
  }>({
    input: null,
    output: null,
    details: null,
  });

  const fetchPart = useCallback(
    async (id: number, part: LogContentPart, opts?: { prefetch?: boolean }) => {
      const controller = new AbortController();
      const prev = abortRef.current[part];
      if (prev) prev.abort();
      abortRef.current[part] = controller;

      const setLoading =
        part === "input"
          ? setInputLoading
          : part === "output"
            ? setOutputLoading
            : setDetailsLoading;
      const setError =
        part === "input" ? setInputError : part === "output" ? setOutputError : setDetailsError;
      const setContent =
        part === "input"
          ? setInputContent
          : part === "output"
            ? setOutputContent
            : setDetailsContent;
      const setLoaded =
        part === "input" ? setInputLoaded : part === "output" ? setOutputLoaded : setDetailsLoaded;

      setLoading(true);
      if (!opts?.prefetch) setError(null);

      try {
        const result =
          part === "details"
            ? fetchDetailsFn
              ? await fetchDetailsFn(id, { signal: controller.signal })
              : await usageApi.getLogContentPart(id, part, {
                  signal: controller.signal,
                  timeoutMs: 60_000,
                })
            : fetchPartFn
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
          setLoaded(true);
          return;
        }

        const input = typeof record.input_content === "string" ? record.input_content : "";
        const output = typeof record.output_content === "string" ? record.output_content : "";
        setContent(part === "input" ? input : part === "output" ? output : "");
        setModel(typeof record.model === "string" ? record.model : "");
        setLoaded(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (opts?.prefetch) return;
        setError(err instanceof Error ? err.message : t("error_detail.load_failed"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [fetchFn, fetchPartFn, fetchDetailsFn, t],
  );

  useEffect(() => {
    if (!open || !logId) return;

    setInputContent("");
    setOutputContent("");
    setDetailsContent("");
    setInputLoaded(false);
    setOutputLoaded(false);
    setDetailsLoaded(false);
    setModel("");
    setInputError(null);
    setOutputError(null);
    setDetailsError(null);
    setInputLoading(false);
    setOutputLoading(false);
    setDetailsLoading(false);

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
      abortRef.current.details?.abort();
      abortRef.current.input = null;
      abortRef.current.output = null;
      abortRef.current.details = null;
      setInputLoading(false);
      setOutputLoading(false);
      setDetailsLoading(false);
    };
  }, [open, logId, resolvedInitialTab, fetchPart]);

  return {
    inputLoading,
    outputLoading,
    detailsLoading,
    inputError,
    outputError,
    detailsError,
    inputContent,
    outputContent,
    detailsContent,
    inputLoaded,
    outputLoaded,
    detailsLoaded,
    model,
    fetchPart,
  };
}
