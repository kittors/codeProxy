import { useRef, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { surface } from "@code-proxy/ui";
import { imageStageClassName } from "./stageStyles";
import type { GeneratedImage } from "./useImageGenerationTask";

// 浮在画布 / 图片上的小部件（计时、计数、翻页）：半透明的浮层底 + 模糊，任何底色上都看得清。
// 浮在画布上的小胶囊：半透明浮层底 + 阴影描边（shadow-control），不画 border。
const FLOATING = "bg-elevated/80 text-ink-2 shadow-control backdrop-blur-md";

/**
 * 测试弹窗中间的画布：空闲时一句引导，生成中显示阶段文案和计时，失败时收成一行错误，
 * 成功后是可左右滑动 / 翻页的结果轮播，点图打开大图预览。
 * 从 ImageGenerationPageContent 拆出（那个文件卡在行数棘轮上）。
 */
export function ImageResultStage({
  submitting,
  images,
  activeIndex,
  onActiveIndexChange,
  errorMessage,
  statusText,
  elapsedLabel,
  hasUploads,
  editing,
  model,
  onPreview,
}: {
  submitting: boolean;
  images: GeneratedImage[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  errorMessage: string;
  statusText: string;
  elapsedLabel: string | null;
  hasUploads: boolean;
  /** 图生图（上传了参考图）：空闲时的引导语不同。 */
  editing: boolean;
  model: string;
  onPreview: () => void;
}) {
  const { t } = useTranslation();
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const activeImage = images[activeIndex] ?? null;
  const hasMultipleResults = images.length > 1;
  const showGeneratingState = submitting && !activeImage && !errorMessage;
  const showIdleCanvas = !submitting && !activeImage && !errorMessage;

  const showImageAt = (index: number) => {
    onActiveIndexChange(Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || !hasMultipleResults) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }
    showImageAt(activeIndex + (deltaX < 0 ? 1 : -1));
  };

  return (
    <>
      <div
        data-testid="image-generation-stage"
        data-state={
          submitting ? "generating" : activeImage ? "ready" : errorMessage ? "error" : "idle"
        }
        className={imageStageClassName({
          errorMessage,
          hasImage: Boolean(activeImage),
          hasUploads,
        })}
        aria-live="polite"
      >
        {elapsedLabel ? (
          <div
            className={[
              "absolute top-3 z-20 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              FLOATING,
              activeImage ? "left-3" : "right-3",
            ].join(" ")}
          >
            {elapsedLabel}
          </div>
        ) : null}
        {showGeneratingState ? (
          <>
            <div className="image-generation-dots-layer" />
            <div className="image-generation-flow-layer" />
          </>
        ) : null}
        {activeImage ? (
          <>
            <div
              className="relative z-10 h-full w-full overflow-hidden"
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
            >
              <div
                data-testid="image-generation-carousel-track"
                className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                style={{
                  transform: `translateX(${activeIndex === 0 ? 0 : -activeIndex * 100}%)`,
                }}
              >
                {images.map((image, index) => (
                  <div
                    key={`generated-image-${index}`}
                    className="h-full w-full shrink-0"
                    aria-hidden={index !== activeIndex}
                  >
                    <div
                      data-testid={
                        index === activeIndex ? "image-generation-result-scroll" : undefined
                      }
                      className="h-full w-full overflow-auto"
                    >
                      <div className="min-h-full w-full p-3 sm:p-4">
                        <img
                          src={image.src}
                          alt={t("image_generation.preview_alt", { model })}
                          className="block h-auto w-full cursor-zoom-in select-none"
                          draggable={false}
                          onClick={onPreview}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {hasMultipleResults ? (
              <>
                <div
                  data-testid="image-generation-counter"
                  className={[
                    "absolute top-3 right-3 z-20 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
                    FLOATING,
                  ].join(" ")}
                >
                  {activeIndex + 1}/{images.length}
                </div>
                {(
                  [
                    ["prev", -1, "left-3", ChevronLeft],
                    ["next", 1, "right-3", ChevronRight],
                  ] as const
                ).map(([key, step, side, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => showImageAt(activeIndex + step)}
                    disabled={step < 0 ? activeIndex <= 0 : activeIndex >= images.length - 1}
                    aria-label={t(key === "prev" ? "image_generation.prev_image" : "image_generation.next_image")}
                    className={[
                      "absolute top-1/2 z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition hover:bg-elevated disabled:pointer-events-none disabled:opacity-35",
                      FLOATING,
                      side,
                    ].join(" ")}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </>
            ) : null}
            {/* 浮在图片上：固定用半透明黑底白字，任何底色的图上都看得清。 */}
            <button
              type="button"
              onClick={onPreview}
              className="absolute right-3 bottom-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
            >
              {t("image_generation.open_preview")}
            </button>
          </>
        ) : (
          <div
            data-testid="image-generation-preview"
            className={[
              "relative flex w-full overflow-hidden bg-transparent",
              errorMessage && !activeImage ? "px-4 py-3.5" : "h-full px-6 py-6 sm:px-8 sm:py-8",
            ].join(" ")}
          >
            <div className="relative z-10 flex h-full w-full items-start">
              {showGeneratingState ? (
                <div className="max-w-md">
                  <p className="text-3xl font-semibold tracking-tight text-ink-2 sm:text-4xl">
                    {statusText}
                  </p>
                  <p className="mt-2 text-sm text-ink-3">{t("image_generation.generating_subtitle")}</p>
                </div>
              ) : null}

              {showIdleCanvas ? (
                <p className="max-w-md text-lg font-medium text-ink-2">
                  {t(editing ? "image_generation.idle_hint_edits" : "image_generation.idle_hint")}
                </p>
              ) : null}

              {errorMessage ? (
                <div className="flex min-w-0 items-start gap-2.5">
                  <CircleAlert
                    size={16}
                    className="mt-1 shrink-0 text-rose-600 dark:text-rose-400"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 break-words text-sm leading-6">{errorMessage}</p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {activeImage?.revisedPrompt ? (
        <div className={[surface({ tone: "inset", radius: "2xl" }), "shrink-0 px-4 py-3"].join(" ")}>
          <p className="text-xs font-medium text-ink-3">{t("image_generation.revised_prompt_label")}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-2">{activeImage.revisedPrompt}</p>
        </div>
      ) : null}
    </>
  );
}
