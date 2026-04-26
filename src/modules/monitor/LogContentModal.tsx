import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Braces,
  Code2,
  Download,
  Eye,
  FileInput,
  FileOutput,
  Globe2,
  Info,
  Loader2,
  SendHorizontal,
  ServerCog,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildInputRenderedView,
  buildOutputRenderedView,
} from "@/modules/monitor/log-content/parsers";
import {
  ContentModal,
  MessageBlock,
  MessageList,
  PlainPre,
} from "@/modules/monitor/log-content/rendering";
import { scheduleIdle, type CancelFn } from "@/modules/monitor/log-content/scheduler";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ImagePreviewOverlay } from "@/modules/ui/ImagePreviewOverlay";
import type {
  AsyncParsedState,
  LogContentModalProps,
  LogContentPart,
  RenderedView,
} from "@/modules/monitor/log-content/types";
import { useLogContentData } from "@/modules/monitor/log-content/useLogContentData";

const VIRTUAL_MESSAGE_REVEAL_THRESHOLD = 80;
const MODAL_CONTENT_LOAD_DELAY_MS = 260;
const LOADING_EXIT_MS = 220;
const CONTENT_ENTER_MS = 340;
type ContentPhase = "loading" | "error" | "content";
type JsonObject = Record<string, unknown>;
type ImageGenerationInputView = {
  model: string;
  prompt: string;
  parameters: Array<{ key: string; value: string }>;
};
type ImageGenerationOutputView = {
  created?: number;
  images: Array<{ src: string; revisedPrompt?: string }>;
};
type ImageGenerationOutputImage = { src: string; revisedPrompt?: string };
type RequestDetailRecord = Record<string, unknown>;
type RequestDetailTone = "client" | "upstream" | "response" | "extra";

const REQUEST_DETAIL_TONE_STYLES: Record<
  RequestDetailTone,
  { accent: string; badge: string; header: string }
> = {
  client: {
    accent: "border-l-sky-400 dark:border-l-sky-400/80",
    badge:
      "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20",
    header: "from-sky-50/80 to-white dark:from-sky-500/10 dark:to-neutral-950",
  },
  upstream: {
    accent: "border-l-amber-400 dark:border-l-amber-300/80",
    badge:
      "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/20",
    header: "from-amber-50/80 to-white dark:from-amber-400/10 dark:to-neutral-950",
  },
  response: {
    accent: "border-l-emerald-400 dark:border-l-emerald-300/80",
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-300/20",
    header: "from-emerald-50/80 to-white dark:from-emerald-400/10 dark:to-neutral-950",
  },
  extra: {
    accent: "border-l-slate-300 dark:border-l-neutral-600",
    badge:
      "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15",
    header: "from-slate-50 to-white dark:from-white/5 dark:to-neutral-950",
  },
};

function parseJsonObject(raw: string): JsonObject | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as JsonObject;
  } catch {
    return null;
  }
}

function stringifyFieldValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

function parseRequestDetails(raw: string): RequestDetailRecord | null {
  return parseJsonObject(raw);
}

function formatDetailScalar(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function countDetailEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value === null || value === undefined || value === "" ? 0 : 1;
}

function isComplexDetailValue(value: unknown): value is Record<string, unknown> | unknown[] {
  return Boolean(value) && typeof value === "object";
}

function RequestDetailCodeBlock({ text }: { text: string }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-950 px-3 py-2.5 font-mono text-xs leading-5 whitespace-pre-wrap text-slate-100 shadow-inner dark:border-neutral-800 dark:bg-black/60">
      {text || "--"}
    </pre>
  );
}

function RequestDetailPrimitive({ value }: { value: unknown }) {
  const text = formatDetailScalar(value);
  if (text.includes("\n") || text.length > 120) {
    return <RequestDetailCodeBlock text={text} />;
  }
  return (
    <span className="inline-block max-w-full break-all rounded-md bg-slate-50 px-2 py-1 font-mono text-[13px] leading-5 text-slate-800 ring-1 ring-slate-200/70 dark:bg-white/[0.04] dark:text-slate-100 dark:ring-white/10">
      {text || "--"}
    </span>
  );
}

function RequestDetailObject({
  entries,
  depth = 0,
}: {
  entries: Array<[string, unknown]>;
  depth?: number;
}) {
  if (entries.length === 0) {
    return <span className="text-slate-400 dark:text-white/35">{"{}"}</span>;
  }

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950/70",
        depth > 0 ? "shadow-none" : "shadow-sm shadow-slate-950/[0.03]",
      ].join(" ")}
    >
      {entries.map(([key, entryValue]) => (
        <div
          key={key}
          className="grid gap-2 border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-neutral-800/80 sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)]"
        >
          <div className="min-w-0">
            <code className="inline-flex max-w-full items-center rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] leading-4 break-all text-slate-600 ring-1 ring-slate-200/80 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10">
              {key}
            </code>
          </div>
          <div className="min-w-0 text-sm text-slate-900 dark:text-white">
            <RequestDetailValue value={entryValue} depth={depth + 1} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RequestDetailValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400 dark:text-white/35">[]</span>;
    }
    return (
      <div className="grid gap-2">
        {value.map((item, index) => (
          <div
            key={index}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950/70"
          >
            <div className="mb-2 font-mono text-[11px] text-slate-400 dark:text-white/35">
              #{index + 1}
            </div>
            <RequestDetailValue value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return <RequestDetailObject entries={entries} depth={depth} />;
  }

  return <RequestDetailPrimitive value={value} />;
}

function RequestDetailSection({
  title,
  value,
  tone = "extra",
  icon,
  testId,
}: {
  title: string;
  value: unknown;
  tone?: RequestDetailTone;
  icon: ReactNode;
  testId?: string;
}) {
  const styles = REQUEST_DETAIL_TONE_STYLES[tone];
  const entryCount = countDetailEntries(value);
  const content = isComplexDetailValue(value) ? value : { value };

  return (
    <section
      data-testid={testId}
      className={[
        "overflow-hidden rounded-2xl border border-l-4 border-slate-200 bg-white shadow-sm shadow-slate-950/[0.04] dark:border-neutral-800 dark:bg-neutral-950",
        styles.accent,
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r px-4 py-3 dark:border-neutral-800/80",
          styles.header,
        ].join(" ")}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={[
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
              styles.badge,
            ].join(" ")}
          >
            {icon}
          </span>
          <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 font-mono text-[11px] text-slate-500 ring-1 ring-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10">
          {entryCount}
        </span>
      </div>
      <div className="bg-slate-50/50 p-3 dark:bg-neutral-900/40">
        <RequestDetailValue value={content ?? {}} />
      </div>
    </section>
  );
}

function parseImageGenerationInput(raw: string): ImageGenerationInputView | null {
  const parsed = parseJsonObject(raw);
  if (!parsed) return null;
  const model = typeof parsed.model === "string" ? parsed.model : "";
  const prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
  if (!model && !prompt) return null;

  const parameters = Object.entries(parsed)
    .filter(([key]) => key !== "model" && key !== "prompt")
    .map(([key, value]) => ({ key, value: stringifyFieldValue(value) }))
    .filter((item) => item.value);

  return {
    model,
    prompt,
    parameters,
  };
}

function parseImageGenerationOutput(raw: string): ImageGenerationOutputView | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || !Array.isArray(parsed.data)) return null;

  const images = parsed.data
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as JsonObject;
      const b64Json = typeof record.b64_json === "string" ? record.b64_json.trim() : "";
      if (!b64Json) return null;
      const src = `data:image/png;base64,${b64Json}`;
      const revisedPrompt =
        typeof record.revised_prompt === "string" && record.revised_prompt.trim()
          ? record.revised_prompt.trim()
          : "";
      return revisedPrompt ? { src, revisedPrompt } : { src };
    })
    .filter((item): item is ImageGenerationOutputImage => item !== null);

  if (images.length === 0) return null;

  return {
    created: typeof parsed.created === "number" ? parsed.created : undefined,
    images,
  };
}

function StructuredRequestCard({
  model,
  prompt,
  parameters,
  testId,
  modelLabel,
  promptLabel,
  parametersLabel,
}: {
  model: string;
  prompt: string;
  parameters: Array<{ key: string; value: string }>;
  testId?: string;
  modelLabel: string;
  promptLabel: string;
  parametersLabel: string;
}) {
  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50/90 dark:border-neutral-800 dark:bg-neutral-900/75"
    >
      <div className="grid gap-0 divide-y divide-slate-200/90 dark:divide-neutral-800">
        {model ? (
          <div className="px-5 py-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/40">
              {modelLabel}
            </p>
            <p className="mt-2 break-words text-sm font-semibold text-slate-900 dark:text-white">
              {model}
            </p>
          </div>
        ) : null}
        {prompt ? (
          <div className="px-5 py-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/40">
              {promptLabel}
            </p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-900 dark:text-white">
              {prompt}
            </pre>
          </div>
        ) : null}
        {parameters.length > 0 ? (
          <div className="px-5 py-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500 dark:text-white/40">
              {parametersLabel}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {parameters.map((item) => (
                <div
                  key={item.key}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-950"
                >
                  <p className="font-mono text-[11px] text-slate-500 dark:text-white/40">
                    {item.key}
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-900 dark:text-white">
                    {item.value}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LogContentModal({
  open,
  logId,
  initialTab = "input",
  onClose,
  showRequestDetails = false,
  fetchFn,
  fetchPartFn,
  fetchDetailsFn,
}: LogContentModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LogContentPart>(initialTab);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const [inputParsed, setInputParsed] = useState<AsyncParsedState>({
    status: "idle",
    view: null,
  });
  const [outputParsed, setOutputParsed] = useState<AsyncParsedState>({
    status: "idle",
    view: null,
  });
  const [inputRevealCount, setInputRevealCount] = useState(0);
  const [outputRevealCount, setOutputRevealCount] = useState(0);
  const [contentLoadReady, setContentLoadReady] = useState(false);
  const [displayPhase, setDisplayPhase] = useState<ContentPhase>("loading");
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const [outputImagePreviewIndex, setOutputImagePreviewIndex] = useState(0);
  const dataOpen = open && contentLoadReady;
  const {
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
  } = useLogContentData({
    open: dataOpen,
    logId,
    initialTab,
    fetchFn,
    fetchPartFn,
    fetchDetailsFn,
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, logId]);

  useEffect(() => {
    if (!open) {
      setContentLoadReady(false);
      setImagePreviewOpen(false);
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
    if (activeTab === "details" && !showRequestDetails) return;
    const content =
      activeTab === "input"
        ? inputContent
        : activeTab === "output"
          ? outputContent
          : detailsContent;
    const loading =
      activeTab === "input"
        ? inputLoading
        : activeTab === "output"
          ? outputLoading
          : detailsLoading;
    const loaded =
      activeTab === "input" ? inputLoaded : activeTab === "output" ? outputLoaded : detailsLoaded;
    if (content || loading || loaded) return;
    void fetchPart(logId, activeTab);
  }, [
    dataOpen,
    logId,
    activeTab,
    inputContent,
    outputContent,
    detailsContent,
    inputLoading,
    outputLoading,
    detailsLoading,
    inputLoaded,
    outputLoaded,
    detailsLoaded,
    showRequestDetails,
    fetchPart,
  ]);

  useEffect(() => {
    setInputParsed({ status: inputContent ? "parsing" : "idle", view: null });
    setInputRevealCount(0);
  }, [inputContent]);

  useEffect(() => {
    setOutputParsed({ status: outputContent ? "parsing" : "idle", view: null });
    setOutputRevealCount(0);
    setOutputImagePreviewIndex(0);
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
    if (activeTab === "details") return null;
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

  const handleDownload = () => {
    const content =
      activeTab === "input"
        ? inputContent
        : activeTab === "output"
          ? outputContent
          : detailsContent;
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
      const Icon = activeTab === "input" ? FileInput : activeTab === "output" ? FileOutput : Info;
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
          <Icon size={40} className="mb-3 opacity-40" />
          <p className="text-sm">
            {activeTab === "input"
              ? t("log_content.no_input")
              : activeTab === "output"
                ? t("log_content.no_output")
                : t("log_content.no_details")}
          </p>
        </div>
      );
    }
    return <PlainPre text={content} />;
  };

  const currentContent =
    activeTab === "input" ? inputContent : activeTab === "output" ? outputContent : detailsContent;
  const activeLoading =
    activeTab === "input" ? inputLoading : activeTab === "output" ? outputLoading : detailsLoading;
  const activeError =
    activeTab === "input" ? inputError : activeTab === "output" ? outputError : detailsError;
  const activeParsed = activeTab === "input" ? inputParsed : outputParsed;
  const isImageGenerationLog = model === "gpt-image-2";
  const imageGenerationInput = useMemo(
    () => (isImageGenerationLog ? parseImageGenerationInput(inputContent) : null),
    [inputContent, isImageGenerationLog],
  );
  const imageGenerationOutput = useMemo(
    () => (isImageGenerationLog ? parseImageGenerationOutput(outputContent) : null),
    [outputContent, isImageGenerationLog],
  );
  const outputImagePreviewSrc =
    imageGenerationOutput?.images[outputImagePreviewIndex]?.src ??
    imageGenerationOutput?.images[0]?.src ??
    null;
  const activeDownloadName = useMemo(() => {
    const suffix = activeTab === "input" ? "input" : activeTab === "output" ? "output" : "details";
    return `${model || "request-log"}-${suffix}.png`;
  }, [activeTab, model]);
  const waitingForRenderedContent =
    Boolean(currentContent) &&
    activeTab !== "details" &&
    viewMode === "rendered" &&
    (activeParsed.status !== "ready" || !activeParsed.view);
  const contentPhase =
    !contentLoadReady || (activeLoading && !currentContent) || waitingForRenderedContent
      ? "loading"
      : activeError && !currentContent
        ? "error"
        : "content";

  useEffect(() => {
    if (contentPhase === displayPhase) return;

    if (contentPhase === "loading") {
      setDisplayPhase("loading");
      return;
    }

    if (displayPhase !== "loading") {
      setDisplayPhase(contentPhase);
      return;
    }

    const timer = window.setTimeout(() => {
      setDisplayPhase(contentPhase);
    }, LOADING_EXIT_MS);

    return () => window.clearTimeout(timer);
  }, [contentPhase, displayPhase]);

  const renderCenteredLoading = () => (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <Loader2 size={24} className="animate-spin text-slate-400 dark:text-white/40" />
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
          {showRequestDetails ? (
            <TabsTrigger value="details">
              <Info size={15} />
              {t("log_content.request_details")}
            </TabsTrigger>
          ) : null}
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1">
        {activeTab === "details" ? null : (
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
        )}
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
    if (imageGenerationInput) {
      return (
        <StructuredRequestCard
          testId="image-request-structured-card"
          model={imageGenerationInput.model}
          prompt={imageGenerationInput.prompt}
          parameters={imageGenerationInput.parameters}
          modelLabel={t("log_content.field_model")}
          promptLabel={t("log_content.field_prompt")}
          parametersLabel={t("log_content.field_parameters")}
        />
      );
    }
    if (inputParsed.status !== "ready" || !inputParsed.view) return renderCenteredLoading();

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
    if (imageGenerationOutput) {
      return (
        <div className="space-y-4">
          {imageGenerationOutput.images.map((image, index) => (
            <div
              key={`${image.src.slice(0, 48)}-${index}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="relative min-h-[160px] overflow-hidden rounded-xl bg-slate-100 dark:bg-black">
                <img
                  src={image.src}
                  alt={t("log_content.output")}
                  className="block h-auto w-full cursor-zoom-in"
                  onClick={() => {
                    setOutputImagePreviewIndex(index);
                    setImagePreviewOpen(true);
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setOutputImagePreviewIndex(index);
                    setImagePreviewOpen(true);
                  }}
                  className="absolute right-3 bottom-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
                >
                  {t("image_generation.open_preview")}
                </button>
              </div>
              {image.revisedPrompt ? (
                <div className="mt-3 rounded-xl bg-white px-3 py-2 dark:bg-neutral-950">
                  <p className="text-xs font-medium text-slate-500 dark:text-white/40">
                    {t("image_generation.revised_prompt_label")}
                  </p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    {image.revisedPrompt}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      );
    }
    if (outputParsed.status !== "ready" || !outputParsed.view) return renderCenteredLoading();

    const view = outputParsed.view;
    const imagePreviewCard = outputImagePreviewSrc ? (
      <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative min-h-[160px] overflow-hidden rounded-xl bg-slate-100 dark:bg-black">
          <img
            src={outputImagePreviewSrc}
            alt={t("log_content.output")}
            className="block h-auto w-full cursor-zoom-in"
            onClick={() => setImagePreviewOpen(true)}
          />
          <button
            type="button"
            onClick={() => setImagePreviewOpen(true)}
            className="absolute right-3 bottom-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
          >
            {t("image_generation.open_preview")}
          </button>
        </div>
      </div>
    ) : null;
    if (view.kind === "messages") {
      const count = outputRevealCount > 0 ? outputRevealCount : Math.min(view.messages.length, 6);
      return (
        <div>
          {imagePreviewCard}
          <MessageList messages={view.messages.slice(0, count)} />
        </div>
      );
    }
    if (view.kind === "pretty_json") {
      return (
        <div>
          {imagePreviewCard}
          <PlainPre text={view.pretty} />
        </div>
      );
    }
    if (view.kind === "text") {
      return (
        <div className="space-y-3">
          {imagePreviewCard}
          <MessageBlock role="assistant" content={view.text} />
        </div>
      );
    }
    return (
      <div>
        {imagePreviewCard}
        <PlainPre text={view.raw} />
      </div>
    );
  };

  const renderDetails = () => {
    if (!detailsContent) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-white/25">
          <Info size={40} className="mb-3 opacity-40" />
          <p className="text-sm">{t("log_content.no_details")}</p>
        </div>
      );
    }

    const details = parseRequestDetails(detailsContent);
    if (!details) return renderRaw(detailsContent);

    return (
      <div className="space-y-4 p-1">
        <RequestDetailSection
          testId="request-detail-section-client"
          title={t("log_content.details_client")}
          value={details.client}
          tone="client"
          icon={<Globe2 size={16} />}
        />
        <RequestDetailSection
          testId="request-detail-section-upstream"
          title={t("log_content.details_upstream")}
          value={details.upstream}
          tone="upstream"
          icon={<SendHorizontal size={16} />}
        />
        <RequestDetailSection
          testId="request-detail-section-response"
          title={t("log_content.details_response")}
          value={details.response}
          tone="response"
          icon={<ServerCog size={16} />}
        />
        {Object.entries(details)
          .filter(([key]) => !["client", "upstream", "response"].includes(key))
          .map(([key, value]) => (
            <RequestDetailSection
              key={key}
              title={key}
              value={value}
              tone="extra"
              icon={<Braces size={16} />}
            />
          ))}
      </div>
    );
  };

  return (
    <ContentModal open={open} model={model} onClose={onClose} tabs={tabBar}>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {displayPhase === "loading" ? (
            <motion.div
              key={`loading-${activeTab}-${logId ?? "none"}`}
              className="absolute inset-0 flex overflow-y-auto overscroll-contain"
              initial={{ opacity: 0 }}
              animate={{ opacity: contentPhase === "loading" ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              {renderCenteredLoading()}
            </motion.div>
          ) : displayPhase === "error" ? (
            <motion.div
              key={`error-${activeTab}-${logId ?? "none"}`}
              className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto overscroll-contain"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            >
              <p className="text-sm text-red-500 dark:text-red-400">{activeError}</p>
            </motion.div>
          ) : (
            <motion.div
              key={`content-${activeTab}-${viewMode}-${logId ?? "none"}`}
              className="absolute inset-0 overflow-y-auto overscroll-contain will-change-[opacity,filter]"
              initial={{ opacity: 0, filter: "blur(3px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{
                duration: CONTENT_ENTER_MS / 1000,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {activeTab === "input"
                ? renderInput()
                : activeTab === "output"
                  ? renderOutput()
                  : renderDetails()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ImagePreviewOverlay
        open={imagePreviewOpen && Boolean(outputImagePreviewSrc)}
        imageSrc={outputImagePreviewSrc}
        imageAlt={t("log_content.output")}
        title={model ? `${t("log_content.output")} · ${model}` : t("log_content.output")}
        downloadName={activeDownloadName}
        images={imageGenerationOutput?.images.map((image, index) => ({
          src: image.src,
          alt: t("log_content.output"),
          downloadName: `${model || "request-log"}-output-${index + 1}.png`,
        }))}
        activeIndex={outputImagePreviewIndex}
        onActiveIndexChange={setOutputImagePreviewIndex}
        onClose={() => setImagePreviewOpen(false)}
      />
    </ContentModal>
  );
}
