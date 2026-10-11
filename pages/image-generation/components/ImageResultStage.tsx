import { useMemo, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { surface } from "@code-proxy/ui";
import { ImageResultCanvas } from "@features/image-result-canvas";
import type { GeneratedImage } from "./useImageGenerationTask";

/**
 * 测试弹窗右侧的结果画布：空闲时一句引导，生成中显示阶段文案和计时，失败时在画布里给出原因，
 * 成功后是可左右滑动 / 翻页的结果轮播，点图打开大图预览。
 *
 * 画布本身（尺寸、按比例完整显示、像素标注）在 features/image-result-canvas，模型目录的测试
 * 弹窗用的是同一个。这里只负责把生成任务的状态映射过去，并在画布下方给出上游的修订提示词。
 */
export function ImageResultStage({
  submitting,
  images,
  activeIndex,
  onActiveIndexChange,
  errorMessage,
  statusText,
  elapsedLabel,
  editing,
  model,
  onPreview,
  className,
  rootRef,
}: {
  submitting: boolean;
  images: GeneratedImage[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  errorMessage: string;
  statusText: string;
  elapsedLabel: string | null;
  /** 图生图（上传了参考图）：空闲时的引导语不同。 */
  editing: boolean;
  model: string;
  onPreview: () => void;
  /** 画布尺寸，由弹窗布局决定。 */
  className?: string;
  /** 整个结果区（画布 + 修订提示词）的根节点，弹窗用它把结果滚进视野。 */
  rootRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const activeImage = images[activeIndex] ?? null;
  // 画布按这个数组的身份记录每张图的实测像素，每次渲染都 map 出新数组会把记录清掉。
  const canvasImages = useMemo(
    () =>
      images.map((image) => ({
        src: image.src,
        format: image.format,
        alt: t("image_generation.preview_alt", { model }),
      })),
    [images, model, t],
  );
  const state = activeImage
    ? "ready"
    : submitting
      ? "generating"
      : errorMessage
        ? "error"
        : "idle";

  return (
    <div ref={rootRef} className="flex min-h-0 min-w-0 flex-col gap-3">
      <ImageResultCanvas
        testIdPrefix="image-generation"
        state={state}
        images={canvasImages}
        activeIndex={activeIndex}
        onActiveIndexChange={onActiveIndexChange}
        onPreview={onPreview}
        idleText={t(editing ? "image_generation.idle_hint_edits" : "image_generation.idle_hint")}
        statusText={statusText}
        statusDetail={t("image_generation.generating_subtitle")}
        errorMessage={errorMessage}
        elapsedLabel={elapsedLabel}
        className={className}
      />

      {activeImage?.revisedPrompt ? (
        <div className={[surface({ tone: "inset", radius: "2xl" }), "shrink-0 px-4 py-3"].join(" ")}>
          <p className="text-xs font-medium text-ink-3">{t("image_generation.revised_prompt_label")}</p>
          <p className="mt-1 line-clamp-2 text-sm text-ink-2">{activeImage.revisedPrompt}</p>
        </div>
      ) : null}
    </div>
  );
}
