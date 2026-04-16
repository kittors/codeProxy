import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Download, Eye, FileInput, FileOutput, Loader2 } from "lucide-react";
import {
  buildInputRenderedView,
  buildOutputRenderedView,
  tryPrettyPrintJson,
} from "@/modules/monitor/log-content/parsers";
import {
  ContentModal,
  MessageBlock,
  MessageList,
  PlainPre,
} from "@/modules/monitor/log-content/rendering";
import { scheduleIdle, type CancelFn } from "@/modules/monitor/log-content/scheduler";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import type {
  AsyncParsedState,
  AsyncPrettyState,
  LogContentModalProps,
  RenderedView,
} from "@/modules/monitor/log-content/types";
import { useLogContentData } from "@/modules/monitor/log-content/useLogContentData";

const VIRTUAL_MESSAGE_REVEAL_THRESHOLD = 80;
const MODAL_CONTENT_LOAD_DELAY_MS = 260;

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
  const [outputParsed, setOutputParsed] = useState<AsyncParsedState>({
    status: "idle",
    view: null,
  });
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
  const [contentLoadReady, setContentLoadReady] = useState(false);
  const dataOpen = open && contentLoadReady;
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
    open: dataOpen,
    logId,
    initialTab,
    fetchFn,
    fetchPartFn,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, logId]);

  useEffect(() => {
    if (!open) {
      setContentLoadReady(false);
      return;
    }

    setContentLoadReady(false);
    const timer = window.setTimeout(() => {
      setContentLoadReady(true);
    }, MODAL_CONTENT_LOAD_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [open, logId]);

  useEffect(() => {
    if (!dataOpen || !logId) return;
    if (activeTab === initialTab) return;
    const content = activeTab === "input" ? inputContent : outputContent;
    const loading = activeTab === "input" ? inputLoading : outputLoading;
    if (content || loading) return;
    void fetchPart(logId, activeTab);
  }, [
    dataOpen,
    logId,
    activeTab,
    inputContent,
    outputContent,
    inputLoading,
    outputLoading,
    fetchPart,
  ]);

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
    if (!dataOpen || !inputContent) return;
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
  }, [dataOpen, inputContent]);

  useEffect(() => {
    if (!dataOpen || !outputContent) return;
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
  }, [dataOpen, outputContent]);

  const activeRenderedView = useMemo<RenderedView | null>(() => {
    return activeTab === "input" ? inputParsed.view : outputParsed.view;
  }, [activeTab, inputParsed.view, outputParsed.view]);

  useEffect(() => {
    if (!dataOpen || viewMode !== "rendered") return;
    if (!activeRenderedView || activeRenderedView.kind !== "messages") return;

    const total = activeRenderedView.messages.length;
    if (total <= 0) return;

    const batchSize = 6;
    const setCount = activeTab === "input" ? setInputRevealCount : setOutputRevealCount;

    if (total > VIRTUAL_MESSAGE_REVEAL_THRESHOLD) {
      setCount(total);
      return;
    }

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
  }, [dataOpen, viewMode, activeTab, activeRenderedView]);

  useEffect(() => {
    if (!dataOpen || viewMode !== "raw") return;
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
  }, [dataOpen, viewMode, activeTab, inputContent, outputContent]);

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

  const renderPreparing = () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={22} className="animate-spin text-slate-400 dark:text-white/40" />
      <span className="ml-3 text-sm text-slate-500 dark:text-white/50">
        {t("common.loading_ellipsis")}
      </span>
    </div>
  );

  const tabBar = (
    <div className="flex items-center gap-3">
      <Tabs value={activeTab} onValueChange={(next) => setActiveTab(next as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="input">
            <FileInput size={15} />
            {t("log_content.input_messages")}
          </TabsTrigger>
          <TabsTrigger value="output">
            <FileOutput size={15} />
            {t("log_content.output")}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1">
        <Tabs value={viewMode} onValueChange={(next) => setViewMode(next as typeof viewMode)}>
          <TabsList>
            <TabsTrigger value="rendered" title={t("log_content.rendered")}>
              <Eye size={14} />
            </TabsTrigger>
            <TabsTrigger value="raw" title={t("log_content.raw_data")}>
              <Code2 size={14} />
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
    if (inputParsed.status !== "ready" || !inputParsed.view) return renderPreparing();

    const view = inputParsed.view;
    if (view.kind === "messages") {
      const count = inputRevealCount > 0 ? inputRevealCount : Math.min(view.messages.length, 6);
      return <MessageList messages={view.messages.slice(0, count)} />;
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
    if (outputParsed.status !== "ready" || !outputParsed.view) return renderPreparing();

    const view = outputParsed.view;
    if (view.kind === "messages") {
      const count = outputRevealCount > 0 ? outputRevealCount : Math.min(view.messages.length, 6);
      return <MessageList messages={view.messages.slice(0, count)} />;
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
      {!contentLoadReady ? (
        <div className="min-h-[200px]" aria-hidden="true" />
      ) : activeLoading && !currentContent ? (
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
        <div className="min-h-[200px]">
          {activeTab === "input" ? renderInput() : renderOutput()}
        </div>
      )}
    </ContentModal>
  );
}
