import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Download, ShieldCheck } from "lucide-react";
import { ImagePreviewOverlay } from "@code-proxy/ui";
import type { ModelTestImage, ModelTestResult } from "@code-proxy/api-client";
import { ImageResultCanvas, type CanvasState } from "@features/image-result-canvas";
import { ModelTestInspector } from "./ModelTestInspector";
import { ModelTestOutput, ProvenanceWarning, imageSource } from "./ModelTestOutput";
import { formatBytes } from "./modelTestModes";

/**
 * 媒体模型（生图、生视频）测试弹窗的右栏。
 *
 * 结果画布固定大小，图片完整缩放在里面，弹窗不随结果变形；画布下面是这张图的尺寸、格式、体积
 * 与出处，再下面是请求与元数据面板。以前结果接在表单下方的半宽小卡片里，一出图就得往下翻，
 * 竖长图只是一条细线。文本模型不走这里，结果仍接在表单下方。
 */
export function ModelTestMediaPane({
  video,
  running,
  phase,
  result,
  error,
  durationBadge,
  className,
}: {
  /** The model makes clips rather than pictures; only the idle hint differs. */
  video: boolean;
  running: boolean;
  phase: string | null;
  result: ModelTestResult | null;
  error: string | null;
  durationBadge: ReactNode;
  /** Size of the result canvas, decided by the dialog layout. */
  className?: string;
}) {
  const { t } = useTranslation();
  const payload = result?.result;
  const images = useMemo<ModelTestImage[]>(
    () => (payload?.kind === "image" ? (payload.images ?? []) : []),
    [payload],
  );
  const canvasImages = useMemo(
    () =>
      images.map((image) => ({
        src: imageSource(image),
        format: image.format,
        alt: t("models_page.test_preview_image"),
      })),
    [images, t],
  );
  // 选中哪张跟着这一批结果走：换了一批，从第一张开始。
  const [selection, setSelection] = useState<{ images: ModelTestImage[]; index: number }>({
    images,
    index: 0,
  });
  const activeIndex = selection.images === images ? selection.index : 0;
  const setActiveIndex = (index: number) => setSelection({ images, index });
  const [previewOpen, setPreviewOpen] = useState(false);

  const succeeded = Boolean(result && !error && (payload || result.content));
  // A clip or a shape-less answer is shown as it came back; the canvas is for pictures.
  const showRawOutput = succeeded && payload?.kind !== "image";
  const noImage = succeeded && payload?.kind === "image" && images.length === 0;

  const state: CanvasState = running
    ? "generating"
    : error || noImage
      ? "error"
      : images.length > 0
        ? "ready"
        : "idle";

  const activeImage = images[activeIndex];

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-testid="model-test-media-pane">
      {showRawOutput && result ? (
        <div data-testid="model-test-success" className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {t("models_page.test_response")}
            </span>
            {durationBadge}
          </div>
          <ModelTestOutput result={result} />
        </div>
      ) : (
        <div
          data-testid={succeeded ? "model-test-success" : error ? "model-test-error" : undefined}
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          <div data-testid={images.length > 0 ? "model-test-images" : undefined} className="flex min-h-0 flex-1 flex-col gap-2">
            <ImageResultCanvas
              testIdPrefix="model-test-image"
              state={state}
              images={canvasImages}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onPreview={() => setPreviewOpen(true)}
              idleText={t(video ? "models_page.test_result_idle_video" : "models_page.test_result_idle_image")}
              statusText={
                phase
                  ? t("models_page.test_running_phase", { phase })
                  : t("models_page.test_running")
              }
              errorMessage={error ?? (noImage ? t("models_page.test_no_image_returned") : undefined)}
              className={className}
            />
            {activeImage ? (
              <ImageCaption image={activeImage} durationBadge={durationBadge} />
            ) : (
              // 失败时也报耗时：卡了多久才失败，本身就是排查线索。
              durationBadge && (error || noImage) ? <div>{durationBadge}</div> : null
            )}
          </div>
        </div>
      )}

      {result ? <ProvenanceWarning result={result} /> : null}
      {/* A failed probe still shows what was sent, which is usually the fastest route to the cause. */}
      {result ? <ModelTestInspector result={result} /> : null}

      <ImagePreviewOverlay
        open={previewOpen && images.length > 0}
        imageSrc={activeImage ? imageSource(activeImage) : null}
        imageAlt=""
        title={t("models_page.test_preview_image")}
        images={images.map((image, index) => ({
          src: imageSource(image),
          alt: "",
          downloadName: `model-test-${index + 1}.${image.format || "png"}`,
        }))}
        activeIndex={activeIndex}
        onActiveIndexChange={setActiveIndex}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}

/**
 * 当前这张图的说明：服务端报的尺寸、格式、体积，耗时与下载，以及文件自带的出处。
 * 出处放在这里而不是元数据面板里：gpt-image-2.5 的请求被 2.0 出图，只有这一行看得出来。
 */
function ImageCaption({ image, durationBadge }: { image: ModelTestImage; durationBadge: ReactNode }) {
  const { t } = useTranslation();
  const dimensions = image.width && image.height ? `${image.width}×${image.height}` : "";
  const meta = [dimensions, image.format?.toUpperCase(), formatBytes(image.bytes)]
    .filter(Boolean)
    .join(" · ");
  const generator = [image.c2pa?.generator, image.c2pa?.generator_version].filter(Boolean).join(" ");

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="truncate text-xs tabular-nums text-ink-3">{meta}</span>
        <span className="flex shrink-0 items-center gap-2">
          {durationBadge}
          <a
            href={imageSource(image)}
            download={`model-test.${image.format || "png"}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            aria-label={t("models_page.test_download_image")}
          >
            <Download size={13} aria-hidden />
          </a>
        </span>
      </div>
      {image.c2pa?.present && generator ? (
        <p className="flex items-center gap-1 text-xs text-ink-2">
          <ShieldCheck size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="truncate">
            {t("models_page.test_provenance_generator")}: {generator}
          </span>
        </p>
      ) : null}
      {image.revised_prompt ? (
        <p className="line-clamp-2 text-xs text-ink-3">
          {t("models_page.test_revised_prompt")}: {image.revised_prompt}
        </p>
      ) : null}
    </div>
  );
}
