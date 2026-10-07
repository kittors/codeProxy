import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Code2, Download, Eye, FileInput, FileOutput, Info, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usageApi, type UsageLogEgressResponse } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  EmptyState,
  ImagePreviewOverlay,
  Tabs,
  TabsList,
  TabsTrigger,
  ScrollFade,
} from "@code-proxy/ui";
import {
  buildInputRenderedView,
  buildOutputRenderedView,
} from "../log-content/parsers";
import {
  ContentModal,
  MessageBlock,
  MessageList,
  PlainPre,
} from "../log-content/rendering";
import {
  OutputImageCard,
  parseImageGenerationInput,
  parseImageGenerationOutput,
  StructuredRequestCard,
} from "../log-content/imageGenerationViews";
import { RequestDetailsView } from "../log-content/requestDetails";
import { scheduleIdle, type CancelFn } from "../log-content/scheduler";
import type {
  AsyncParsedState,
  LogContentModalProps,
  LogContentPart,
  RenderedView,
} from "../log-content/types";
import { useLogContentData } from "../log-content/useLogContentData";

const VIRTUAL_MESSAGE_REVEAL_THRESHOLD = 80;
const MODAL_CONTENT_LOAD_DELAY_MS = 260;
const LOADING_EXIT_MS = 220;
const CONTENT_ENTER_MS = 340;
type ContentPhase = "loading" | "error" | "content";

export function LogContentModal({
  open,
  logId,
  displayModel,
  initialTab = "input",
  onClose,
  showRequestDetails = false,
  showBodyContent = true,
  fetchFn,
  fetchPartFn,
  fetchDetailsFn,
  fetchEgressFn,
}: LogContentModalProps) {
  const { t } = useTranslation();
  const detailsOnly = showRequestDetails && !showBodyContent;
  const resolvedInitialTab: LogContentPart = detailsOnly ? "details" : initialTab;
  const [activeTab, setActiveTab] = useState<LogContentPart>(resolvedInitialTab);
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
  const [egressInfo, setEgressInfo] = useState<UsageLogEgressResponse | null>(
    null,
  );
  const [egressLoading, setEgressLoading] = useState(false);
  const [egressLoaded, setEgressLoaded] = useState(false);
  const [egressError, setEgressError] = useState<string | null>(null);
  const egressAbortRef = useRef<AbortController | null>(null);
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
    initialTab: resolvedInitialTab,
    fetchFn,
    fetchPartFn,
    fetchDetailsFn,
  });

  const fetchEgress = useCallback(
    async (id: number) => {
      const controller = new AbortController();
      egressAbortRef.current?.abort();
      egressAbortRef.current = controller;
      setEgressLoading(true);
      setEgressError(null);
      try {
        const next = fetchEgressFn
          ? await fetchEgressFn(id, { signal: controller.signal })
          : await usageApi.getLogEgress(id, {
              signal: controller.signal,
              timeoutMs: 60_000,
            });
        if (controller.signal.aborted) return;
        setEgressInfo(next);
      } catch (err) {
        if (controller.signal.aborted) return;
        setEgressError(
          err instanceof Error ? err.message : t("error_detail.load_failed"),
        );
      } finally {
        if (!controller.signal.aborted) {
          setEgressLoaded(true);
          setEgressLoading(false);
        }
      }
    },
    [fetchEgressFn, t],
  );

  useEffect(() => {
    setActiveTab(resolvedInitialTab);
  }, [resolvedInitialTab, logId]);

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
    egressAbortRef.current?.abort();
    egressAbortRef.current = null;
    setEgressInfo(null);
    setEgressLoading(false);
    setEgressLoaded(false);
    setEgressError(null);
  }, [logId, open]);

  useEffect(() => {
    if (!dataOpen || !logId) return;
    if (activeTab === resolvedInitialTab) return;
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
      activeTab === "input"
        ? inputLoaded
        : activeTab === "output"
          ? outputLoaded
          : detailsLoaded;
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
    resolvedInitialTab,
    fetchPart,
  ]);

  useEffect(() => {
    if (!dataOpen || !logId || !showRequestDetails) return;
    if (activeTab !== "details") return;
    if (egressLoaded || egressLoading) return;
    void fetchEgress(logId);
  }, [
    activeTab,
    dataOpen,
    egressLoaded,
    egressLoading,
    fetchEgress,
    logId,
    showRequestDetails,
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
    const setCount =
      activeTab === "input" ? setInputRevealCount : setOutputRevealCount;

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

  // 三个页签共用的空态：图标跟着页签走，一眼看出是哪一栏没有记录。
  const renderEmpty = (part: LogContentPart) => {
    const Icon = part === "input" ? FileInput : part === "output" ? FileOutput : Info;
    const title =
      part === "input"
        ? t("log_content.no_input")
        : part === "output"
          ? t("log_content.no_output")
          : t("log_content.no_details");
    // 和加载态一样在内容区里上下居中：弹窗是固定高度，空态贴在顶上会显得下面空了一大块。
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={<Icon size={20} aria-hidden />} title={title} />
      </div>
    );
  };

  const renderRaw = (content: string) =>
    content ? <PlainPre text={content} /> : renderEmpty(activeTab);

  const currentContent =
    activeTab === "input"
      ? inputContent
      : activeTab === "output"
        ? outputContent
        : detailsContent;
  const activeLoading =
    activeTab === "input"
      ? inputLoading
      : activeTab === "output"
        ? outputLoading
        : detailsLoading;
  const activeError =
    activeTab === "input"
      ? inputError
      : activeTab === "output"
        ? outputError
        : detailsError;
  const activeParsed = activeTab === "input" ? inputParsed : outputParsed;
  const isImageGenerationLog = model === "gpt-image-2";
  const imageGenerationInput = useMemo(
    () =>
      isImageGenerationLog ? parseImageGenerationInput(inputContent) : null,
    [inputContent, isImageGenerationLog],
  );
  const imageGenerationOutput = useMemo(
    () =>
      isImageGenerationLog ? parseImageGenerationOutput(outputContent) : null,
    [outputContent, isImageGenerationLog],
  );
  const outputImagePreviewSrc =
    imageGenerationOutput?.images[outputImagePreviewIndex]?.src ??
    imageGenerationOutput?.images[0]?.src ??
    null;
  const activeDownloadName = useMemo(() => {
    const suffix =
      activeTab === "input"
        ? "input"
        : activeTab === "output"
          ? "output"
          : "details";
    return `${model || "request-log"}-${suffix}.png`;
  }, [activeTab, model]);
  const waitingForRenderedContent =
    Boolean(currentContent) &&
    activeTab !== "details" &&
    viewMode === "rendered" &&
    (activeParsed.status !== "ready" || !activeParsed.view);
  const contentPhase =
    !contentLoadReady ||
    (activeLoading && !currentContent) ||
    waitingForRenderedContent
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
    <div className="flex min-h-0 flex-1 items-center justify-center text-ink-3">
      <Loader2 size={22} className="animate-spin" aria-hidden />
      <span className="ml-3 text-sm">{t("common.loading_ellipsis")}</span>
    </div>
  );

  // 左边切换看哪一份（输入 / 输出 / 请求详情），右边是怎么看（渲染 / 原文）与下载。
  // 视图切换带上文字：以前只有眼睛和代码两个图标，要悬停才知道是什么。
  const tabBar = detailsOnly ? null : (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as typeof activeTab)}
      >
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
      <div className="flex items-center gap-2">
        {activeTab === "details" ? null : (
          <Tabs
            size="sm"
            value={viewMode}
            onValueChange={(next) => setViewMode(next as typeof viewMode)}
          >
            <TabsList>
              <TabsTrigger value="rendered" title={t("log_content.rendered")}>
                <Eye size={14} />
                {t("log_content.rendered")}
              </TabsTrigger>
              <TabsTrigger value="raw" title={t("log_content.raw_data")}>
                <Code2 size={14} />
                {t("log_content.raw_data")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          disabled={!currentContent}
          title={t("log_content.download")}
        >
          <Download size={15} />
        </Button>
      </div>
    </div>
  );

  const renderInput = () => {
    if (!inputContent) return renderEmpty("input");
    if (viewMode === "raw") return renderRaw(inputContent);
    if (imageGenerationInput) {
      return (
        <StructuredRequestCard
          testId="image-request-structured-card"
          view={imageGenerationInput}
        />
      );
    }
    if (inputParsed.status !== "ready" || !inputParsed.view)
      return renderCenteredLoading();

    const view = inputParsed.view;
    if (view.kind === "messages") {
      const count =
        inputRevealCount > 0
          ? inputRevealCount
          : Math.min(view.messages.length, 6);
      return <MessageList messages={view.messages.slice(0, count)} />;
    }
    if (view.kind === "pretty_json") return <PlainPre text={view.pretty} />;
    return <PlainPre text={view.kind === "raw" ? view.raw : view.text} />;
  };

  const renderOutput = () => {
    if (!outputContent) return renderEmpty("output");
    if (viewMode === "raw") return renderRaw(outputContent);
    if (imageGenerationOutput) {
      return (
        <div className="space-y-4">
          {imageGenerationOutput.images.map((image, index) => (
            <OutputImageCard
              key={`${image.src.slice(0, 48)}-${index}`}
              image={image}
              onPreview={() => {
                setOutputImagePreviewIndex(index);
                setImagePreviewOpen(true);
              }}
            />
          ))}
        </div>
      );
    }
    if (outputParsed.status !== "ready" || !outputParsed.view)
      return renderCenteredLoading();

    const view = outputParsed.view;
    if (view.kind === "messages") {
      const count =
        outputRevealCount > 0
          ? outputRevealCount
          : Math.min(view.messages.length, 6);
      return <MessageList messages={view.messages.slice(0, count)} />;
    }
    if (view.kind === "pretty_json") return <PlainPre text={view.pretty} />;
    if (view.kind === "text") return <MessageBlock role="assistant" content={view.text} />;
    return <PlainPre text={view.raw} />;
  };

  const renderDetails = () =>
    detailsContent ? (
      <RequestDetailsView
        content={detailsContent}
        egressInfo={egressInfo}
        egressLoading={egressLoading}
        egressError={egressError}
      />
    ) : (
      renderEmpty("details")
    );

  return (
    <>
      <ContentModal
        open={open}
        model={displayModel?.trim() || model}
        onClose={onClose}
        tabs={tabBar}
        // 只剩请求详情时说明原因（正文存储没开），不再把「请求详情」在标题和描述里各写一遍。
        description={detailsOnly ? t("log_content.details_only_desc") : undefined}
      >
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
                <Callout tone="danger" role="alert" className="max-w-md">
                  {activeError}
                </Callout>
              </motion.div>
            ) : (
              <motion.div
                key={`content-${activeTab}-${viewMode}-${logId ?? "none"}`}
                className="absolute inset-0 will-change-[opacity,filter]"
                initial={{ opacity: 0, filter: "blur(3px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: CONTENT_ENTER_MS / 1000,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {/* 内容区上下渐隐：长 JSON、长对话滚动时不会在页签条和弹窗底边被硬生生截断。 */}
                <ScrollFade className="h-full overflow-y-auto overscroll-contain">
                  {activeTab === "input"
                    ? renderInput()
                    : activeTab === "output"
                      ? renderOutput()
                      : renderDetails()}
                </ScrollFade>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ContentModal>
      {/* 大图预览放在弹窗外：弹窗关闭时会冻结内容播完退场动画，预览不该跟着被冻住。 */}
      <ImagePreviewOverlay
        open={imagePreviewOpen && Boolean(outputImagePreviewSrc)}
        imageSrc={outputImagePreviewSrc}
        imageAlt={t("log_content.output")}
        title={
          model
            ? `${t("log_content.output")} · ${model}`
            : t("log_content.output")
        }
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
    </>
  );
}
