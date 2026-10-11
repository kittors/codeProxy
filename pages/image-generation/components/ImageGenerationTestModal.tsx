import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlay } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  FormField,
  ImagePreviewOverlay,
  Modal,
  rules,
  Textarea,
  useFormValidation,
} from "@code-proxy/ui";
import {
  ImageModelPicker,
  imageShapeOptions,
  resolveInitialModel,
  resolveInitialProvider,
  supportsImageEditing,
} from "@features/image-model-picker";
import { useImageGenerationChannels } from "../hooks/useImageGenerationChannels";
import {
  COUNT_OPTIONS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_SIZE,
  DEFAULT_QUALITY,
  MAX_UPLOAD_IMAGES,
  pickShapeDefault,
  AUTO_ASPECT_RATIO,
  type QualityOption,
} from "./generationOptions";
import { ImageParameterFields } from "./ImageParameterFields";
import { ImageResultStage } from "./ImageResultStage";
import { ReferenceImagesField, type UploadedImage } from "./ReferenceImagesField";
import { imageFileExtension, useImageGenerationTask } from "./useImageGenerationTask";
import { useSizePresets } from "./useSizePresets";

const FORM_ID = "image-generation-test-form";
/**
 * Fallback model id, used only until the server's catalog arrives. The selected
 * model itself comes from the catalog: hardcoding it is what kept every non-codex
 * image model unreachable from this page.
 */
const FALLBACK_IMAGE_MODEL = "gpt-image-2";

function createUploadPreviewUrl(file: File): string {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }
  return `data:${file.type || "image/png"};base64,`;
}

function revokeUploadPreviewUrl(url: string) {
  if (url && url.startsWith("blob:") && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

/**
 * 测试生成图片。
 *
 * 左右两栏：左边是全部输入（模型 → 提示词 → 生成参数 → 参考图），右边是结果画布；窄屏时上下排。
 * 画布尺寸由布局决定、不随结果变化，任何比例的图都完整缩放在里面，弹窗不会被结果撑开或挤变形。
 * 主按钮「生成图片」在底部，⌘/Ctrl + Enter 也能生成；上传了参考图就按图生图处理，底部提示跟着变。
 * 从 ImageGenerationPageContent 拆出（那个文件卡在行数棘轮上）。
 */
export function ImageGenerationTestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<QualityOption>(DEFAULT_QUALITY);
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(1);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);
  const [uploadPreviewIndex, setUploadPreviewIndex] = useState(0);
  const { loading: catalogLoading, catalog } = useImageGenerationChannels();
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const sizes = useSizePresets(open);
  const task = useImageGenerationTask(open);
  const validation = useFormValidation({ prompt }, { prompt: [rules.required()] });
  const { reset } = validation;
  const uploadedImagesRef = useRef<UploadedImage[]>([]);
  const resultRef = useRef<HTMLDivElement | null>(null);

  // The catalog arrives asynchronously, so the selection is seeded once it does and
  // then left alone; re-deriving it on every render would fight the user's choice.
  useEffect(() => {
    if (catalog.models.length === 0) return;
    setSelectedProvider((current) => resolveInitialProvider(catalog, current || null));
  }, [catalog]);

  useEffect(() => {
    if (catalog.models.length === 0) return;
    setSelectedModel((current) => resolveInitialModel(catalog, selectedProvider, current || null));
  }, [catalog, selectedProvider]);

  const activeModel = selectedModel || FALLBACK_IMAGE_MODEL;
  const editingSupported = catalog.models.length === 0 || supportsImageEditing(catalog, activeModel);
  // Gemini image models take a ratio and a size tier instead of size and quality.
  const shape = imageShapeOptions(catalog, activeModel);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_ASPECT_RATIO);
  const [imageSize, setImageSize] = useState(DEFAULT_IMAGE_SIZE);

  // Re-seeded whenever the model changes or the dialog reopens: a ratio picked for
  // one model may not exist on the next, and a stale value would be sent anyway.
  useEffect(() => {
    if (!open) return;
    const options = imageShapeOptions(catalog, activeModel);
    if (!options) return;
    setAspectRatio(pickShapeDefault(options.aspectRatios, DEFAULT_ASPECT_RATIO));
    setImageSize(pickShapeDefault(options.imageSizes, DEFAULT_IMAGE_SIZE));
  }, [open, catalog, activeModel]);

  // One selector names both: picking a model decides the credential pool that serves it.
  const handleModelChange = useCallback((provider: string, model: string) => {
    setSelectedProvider(provider);
    setSelectedModel(model);
  }, []);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setQuality(DEFAULT_QUALITY);
    setCount(1);
    setUploadedImages((current) => {
      current.forEach((item) => revokeUploadPreviewUrl(item.previewUrl));
      return [];
    });
    setPreviewOpen(false);
    setUploadPreviewOpen(false);
    setUploadPreviewIndex(0);
    reset();
  }, [open, reset]);

  useEffect(() => {
    uploadedImagesRef.current = uploadedImages;
  }, [uploadedImages]);

  useEffect(() => {
    return () => {
      uploadedImagesRef.current.forEach((item) => revokeUploadPreviewUrl(item.previewUrl));
    };
  }, []);

  const references = editingSupported ? uploadedImages : [];
  const requestMode = references.length > 0 ? "edits" : "generations";
  const activeImage = task.images[task.activeImageIndex] ?? null;

  const addUploads = (files: File[]) => {
    if (files.length === 0) return;
    setUploadedImages((current) => {
      const remainingSlots = Math.max(0, MAX_UPLOAD_IMAGES - current.length);
      if (remainingSlots === 0) return current;
      return [
        ...current,
        ...files.slice(0, remainingSlots).map((file, index) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
          file,
          previewUrl: createUploadPreviewUrl(file),
        })),
      ];
    });
  };

  const removeUpload = (id: string) => {
    setUploadedImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) revokeUploadPreviewUrl(target.previewUrl);
      const next = current.filter((item) => item.id !== id);
      if (uploadPreviewIndex >= next.length) {
        setUploadPreviewIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const submit = () => {
    if (task.submitting) return;
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    const base = {
      model: activeModel,
      prompt: prompt.trim(),
      n: count,
      ...(shape
        ? {
            // "auto" is sent as no ratio, which leaves the shape to the model.
            ...(aspectRatio && aspectRatio !== AUTO_ASPECT_RATIO
              ? { aspect_ratio: aspectRatio }
              : {}),
            ...(imageSize ? { image_size: imageSize } : {}),
          }
        : { size: sizes.size, quality }),
    };
    setPreviewOpen(false);
    // 窄屏上下排时结果在表单下方：开始生成就把它带进视野，不用自己往下翻。宽屏两栏时
    // 结果本来就在视野里，nearest 不会滚动。
    window.requestAnimationFrame(() =>
      resultRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }),
    );
    void task.generate(
      requestMode === "edits"
        ? { mode: "edits", ...base, images: references.map((item) => item.file) }
        : { mode: "generations", ...base },
    );
  };

  const modeLabel = t(
    requestMode === "edits"
      ? "image_generation.image_to_image_title"
      : "image_generation.text_to_image_title",
  );

  return (
    <>
      <Modal
        open={open}
        title={t("image_generation.test_title")}
        icon={<ImagePlay />}
        size="xl"
        onClose={onClose}
        onSubmitShortcut={submit}
        footerStart={`${modeLabel} · ${t("image_generation.test_shortcut")}`}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              loading={task.submitting}
              data-testid="image-generation-send-button"
            >
              {task.submitting
                ? t("image_generation.generating_button")
                : t("image_generation.generate_button")}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          id={FORM_ID}
          noValidate
          // 宽屏左右两栏；左栏定宽，右栏的画布随行高拉伸，最低一档由画布自己保证。
          className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div data-testid="image-generation-composer" className="flex min-w-0 flex-col gap-4">
            <ImageModelPicker
              catalog={catalog}
              provider={selectedProvider}
              model={activeModel}
              disabled={task.submitting || catalogLoading}
              onChange={handleModelChange}
            />

            <FormField
              htmlFor="image-generation-prompt"
              label={t("image_generation.prompt_label")}
              required
              error={validation.error("prompt")}
              reserveMeta={false}
            >
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                {...validation.bind("prompt")}
                placeholder={t("image_generation.prompt_placeholder")}
                rows={5}
                // cn 只是拼接、不合并冲突类，要用 ! 盖过 Textarea 自带的 resize-y：
                // 拖高输入框会把右侧画布一起拉长。
                className="!resize-none"
              />
            </FormField>

            <ImageParameterFields
              shape={shape}
              aspectRatio={aspectRatio}
              onAspectRatioChange={setAspectRatio}
              imageSize={imageSize}
              onImageSizeChange={setImageSize}
              sizes={sizes}
              quality={quality}
              onQualityChange={setQuality}
              count={count}
              onCountChange={setCount}
            />

            {editingSupported ? (
              <ReferenceImagesField
                images={uploadedImages}
                max={MAX_UPLOAD_IMAGES}
                onAdd={addUploads}
                onRemove={removeUpload}
                onPreview={(index) => {
                  setUploadPreviewIndex(index);
                  setUploadPreviewOpen(true);
                }}
              />
            ) : null}
          </div>

          <ImageResultStage
            submitting={task.submitting}
            images={task.images}
            activeIndex={task.activeImageIndex}
            onActiveIndexChange={task.setActiveImageIndex}
            errorMessage={task.errorMessage}
            statusText={t(task.statusKey)}
            elapsedLabel={task.elapsedLabel}
            editing={requestMode === "edits"}
            model={activeModel}
            onPreview={() => setPreviewOpen(true)}
            rootRef={resultRef}
            // 窄屏上下排时给定高度；宽屏占满右栏，最低一档保证结果有地方放。
            className="h-[clamp(220px,38vh,340px)] lg:h-auto lg:min-h-[clamp(320px,52vh,520px)] lg:flex-1"
          />
        </form>
      </Modal>

      <ImagePreviewOverlay
        open={previewOpen && Boolean(activeImage)}
        imageSrc={activeImage?.src ?? null}
        imageAlt={t("image_generation.preview_alt", { model: activeModel })}
        title={t("image_generation.image_preview_title")}
        downloadName={`${activeModel}-${task.activeImageIndex + 1}.${imageFileExtension(activeImage?.format)}`}
        images={task.images.map((image, index) => ({
          src: image.src,
          alt: t("image_generation.preview_alt", { model: activeModel }),
          downloadName: `${activeModel}-${index + 1}.${imageFileExtension(image.format)}`,
        }))}
        activeIndex={task.activeImageIndex}
        onActiveIndexChange={task.setActiveImageIndex}
        onClose={() => setPreviewOpen(false)}
      />
      <ImagePreviewOverlay
        open={editingSupported && uploadPreviewOpen && uploadedImages.length > 0}
        imageSrc={uploadedImages[uploadPreviewIndex]?.previewUrl ?? null}
        imageAlt={
          uploadedImages[uploadPreviewIndex]?.file.name ?? t("image_generation.upload_images_label")
        }
        title={t("image_generation.image_preview_title")}
        downloadName={uploadedImages[uploadPreviewIndex]?.file.name}
        images={uploadedImages.map((item) => ({
          src: item.previewUrl,
          alt: item.file.name,
          downloadName: item.file.name,
        }))}
        activeIndex={uploadPreviewIndex}
        onActiveIndexChange={setUploadPreviewIndex}
        onClose={() => setUploadPreviewOpen(false)}
      />
    </>
  );
}
