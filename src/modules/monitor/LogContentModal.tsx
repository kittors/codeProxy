import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Download, Eye, FileInput, FileOutput, Loader2 } from "lucide-react";
import { buildInputRenderedView, buildOutputRenderedView, tryPrettyPrintJson } from "@/modules/monitor/log-content/parsers";
import { ContentModal, MessageBlock, PlainPre } from "@/modules/monitor/log-content/rendering";
import { scheduleIdle, type CancelFn } from "@/modules/monitor/log-content/scheduler";
import type {
  AsyncParsedState,
  AsyncPrettyState,
  LogContentModalProps,
  RenderedView,
} from "@/modules/monitor/log-content/types";
import { useLogContentData } from "@/modules/monitor/log-content/useLogContentData";

export function LogContentModal({
  open,
  logId,
  initialTab = "input",
  onClose,
  fetchFn,
  fetchPartFn,
}: LogContentModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"input" | "output">(initialTab);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [inputParsed, setInputParsed] = useState<AsyncParsedState>({ status: "idle", view: null });
  const [outputParsed, setOutputParsed] = useState<AsyncParsedState>({ status: "idle", view: null });
  const [inputRawPretty, setInputRawPretty] = useState<AsyncPrettyState>({
    status: "idle",
    pretty: null,
  });
  const [outputRawPretty, setOutputRawPretty] = useState<AsyncPrettyState>({
    status: "idle",
    pretty: null,
  });
  const [inputRevealCount, setInputRevealCount] = useState(0);
  const [outputRevealCount, setOutputRevealCount] = useState(0);
  const {
    inputLoading,
    outputLoading,
    inputError,
    outputError,
    inputContent,
    outputContent,
    model,
    fetchPart,
  } = useLogContentData({
    open,
    logId,
    initialTab,
    fetchFn,
    fetchPartFn,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, logId]);

  useEffect(() => {
    if (!open || !logId) return;
    const content = activeTab === "input" ? inputContent : outputContent;
    const loading = activeTab === "input" ? inputLoading : outputLoading;
    if (content || loading) return;
    void fetchPart(logId, activeTab);
  }, [open, logId, activeTab, inputContent, outputContent, inputLoading, outputLoading, fetchPart]);

  useEffect(() => {
    setInputParsed({ status: inputContent ? "parsing" : "idle", view: null });
    setInputRawPretty({ status: "idle", pretty: null });
    setInputRevealCount(0);
  }, [inputContent]);

  useEffect(() => {
    setOutputParsed({ status: outputContent ? "parsing" : "idle", view: null });
    setOutputRawPretty({ status: "idle", pretty: null });
    setOutputRevealCount(0);
  }, [outputContent]);

  useEffect(() => {
    if (!open || !inputContent) return;
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      const view = buildInputRenderedView(inputContent);
      if (cancelled) return;
      setInputParsed({ status: "ready", view });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [open, inputContent]);

  useEffect(() => {
    if (!open || !outputContent) return;
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      const view = buildOutputRenderedView(outputContent);
      if (cancelled) return;
      setOutputParsed({ status: "ready", view });
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [open, outputContent]);

  const activeRenderedView = useMemo<RenderedView | null>(() => {
    return activeTab === "input" ? inputParsed.view : outputParsed.view;
  }, [activeTab, inputParsed.view, outputParsed.view]);

  useEffect(() => {
    if (!open || viewMode !== "rendered") return;
    if (!activeRenderedView || activeRenderedView.kind !== "messages") return;

    const total = activeRenderedView.messages.length;
    if (total <= 0) return;

    const batchSize = 6;
    const setCount = activeTab === "input" ? setInputRevealCount : setOutputRevealCount;

    let cancelled = false;
    let current = Math.min(total, batchSize);
    setCount(current);

    let cancel: CancelFn | null = null;
    const step = () => {
      if (cancelled) return;
      current = Math.min(total, current + batchSize);
      setCount(current);
      if (current < total) cancel = scheduleIdle(step, 120);
    };

    if (current < total) cancel = scheduleIdle(step, 120);

    return () => {
      cancelled = true;
      if (cancel) cancel();
    };
  }, [open, viewMode, activeTab, activeRenderedView]);

  useEffect(() => {
    if (!open || viewMode !== "raw") return;
    const isInput = activeTab === "input";
    const raw = isInput ? inputContent : outputContent;
    if (!raw) return;

    const state = isInput ? inputRawPretty : outputRawPretty;
    const setState = isInput ? setInputRawPretty : setOutputRawPretty;
    if (state.status === "ready") return;

    let cancelled = false;
    setState({ status: "formatting", pretty: null });

    const cancel = scheduleIdle(() => {
      const pretty = tryPrettyPrintJson(raw);
      if (cancelled) return;
      setState({ status: "ready", pretty });
    });

    return () => {
      cancelled = true;
      cancel();
    };
  }, [open, viewMode, activeTab, inputContent, outputContent]);

  const handleDownload = () => {
    const content = activeTab === "input" ? inputContent : outputContent;
    if (!content) return;
    let ext = ".log";
    let mimeType = "text/plain;charset=utf-8";
    try {
      JSON.parse(content);
      ext = ".json";
      mimeType = "application/json;charset=utf-8";
    } catch {
      // use .log
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `log_${logId ?? "unknown"}_${activeTab}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderRaw = (content: string) => {
    if (!content) {
      const Icon = activeTab === "input" ? FileInput : FileOutput;
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
          <Icon size={40} className="mb-3 opacity-40" />
          <p className="text-sm">
            {activeTab === "input" ? t("log_content.no_input") : t("log_content.no_output")}
          </p>
        </div>
      );
    }
    const state = activeTab === "input" ? inputRawPretty : outputRawPretty;
    return <PlainPre text={state.pretty ?? content} />;
  };

  const currentContent = activeTab === "input" ? inputContent : outputContent;
  const activeLoading = activeTab === "input" ? inputLoading : outputLoading;
  const activeError = activeTab === "input" ? inputError : outputError;

  const tabBar = (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-neutral-900">
        {(
          [
            { key: "input" as const, label: t("log_content.input_messages"), Icon: FileInput },
            { key: "output" as const, label: t("log_content.output"), Icon: FileOutput },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              activeTab === key
                ? "bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-white/40 dark:hover:text-white/60",
            ].join(" ")}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => setViewMode("rendered")}
            title={t("log_content.rendered")}
            className={[
              "flex items-center justify-center rounded-md p-1.5 transition-all",
              viewMode === "rendered"
                ? "bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60",
            ].join(" ")}
          >
            <Eye size={14} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("raw")}
            title={t("log_content.raw_data")}
            className={[
              "flex items-center justify-center rounded-md p-1.5 transition-all",
              viewMode === "raw"
                ? "bg-white text-slate-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                : "text-slate-400 hover:text-slate-600 dark:text-white/30 dark:hover:text-white/60",
            ].join(" ")}
          >
            <Code2 size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!currentContent}
          title={t("log_content.download")}
          className="flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed dark:text-white/30 dark:hover:bg-neutral-900 dark:hover:text-white/60"
        >
          <Download size={14} />
        </button>
      </div>
    </div>
  );

  const renderInput = () => {
    if (!inputContent) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
          <FileInput size={40} className="mb-3 opacity-40" />
          <p className="text-sm">{t("log_content.no_input")}</p>
        </div>
      );
    }
    if (viewMode === "raw") return renderRaw(inputContent);
    if (inputParsed.status !== "ready" || !inputParsed.view) return <PlainPre text={inputContent} />;

    const view = inputParsed.view;
    if (view.kind === "messages") {
      const count = inputRevealCount > 0 ? inputRevealCount : Math.min(view.messages.length, 6);
      return (
        <div className="space-y-3">
          {view.messages.slice(0, count).map((msg, idx) => (
            <MessageBlock key={idx} role={msg.role} content={msg.content} />
          ))}
        </div>
      );
    }
    if (view.kind === "pretty_json") return <PlainPre text={view.pretty} />;
    return <PlainPre text={view.kind === "raw" ? view.raw : view.text} />;
  };

  const renderOutput = () => {
    if (!outputContent) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
          <FileOutput size={40} className="mb-3 opacity-40" />
          <p className="text-sm">{t("log_content.no_output")}</p>
        </div>
      );
    }
    if (viewMode === "raw") return renderRaw(outputContent);
    if (outputParsed.status !== "ready" || !outputParsed.view) return <PlainPre text={outputContent} />;

    const view = outputParsed.view;
    if (view.kind === "messages") {
      const count = outputRevealCount > 0 ? outputRevealCount : Math.min(view.messages.length, 6);
      return (
        <div className="space-y-3">
          {view.messages.slice(0, count).map((msg, idx) => (
            <MessageBlock key={idx} role={msg.role} content={msg.content} />
          ))}
        </div>
      );
    }
    if (view.kind === "pretty_json") return <PlainPre text={view.pretty} />;
    if (view.kind === "text") {
      return (
        <div className="space-y-3">
          <MessageBlock role="assistant" content={view.text} />
        </div>
      );
    }
    return <PlainPre text={view.raw} />;
  };

  return (
    <ContentModal open={open} model={model} onClose={onClose} tabs={tabBar}>
      {activeLoading && !currentContent ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-400 dark:text-white/40" />
          <span className="ml-3 text-sm text-slate-500 dark:text-white/50">
            {t("common.loading_ellipsis")}
          </span>
        </div>
      ) : activeError && !currentContent ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-sm text-red-500 dark:text-red-400">{activeError}</p>
        </div>
      ) : (
        <div className="min-h-[200px]">{activeTab === "input" ? renderInput() : renderOutput()}</div>
      )}
    </ContentModal>
  );
}
