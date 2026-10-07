import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlay } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  FormField,
  ImagePreviewOverlay,
  Modal,
  rules,
  SearchableSelect,
  Select,
  Textarea,
  useFormValidation,
} from "@code-proxy/ui";
import {
  ImageModelPicker,
  resolveInitialModel,
  resolveInitialProvider,
  supportsImageEditing,
} from "@features/image-model-picker";
import { useImageGenerationChannels } from "../hooks/useImageGenerationChannels";
import {
  COUNT_OPTIONS,
  DEFAULT_QUALITY,
  MAX_UPLOAD_IMAGES,
  QUALITY_OPTIONS,
  type QualityOption,
} from "./generationOptions";
import { ImageResultStage } from "./ImageResultStage";
import { ReferenceImagesField, type UploadedImage } from "./ReferenceImagesField";
import { useImageGenerationTask } from "./useImageGenerationTask";
import { normalizeImageGenerationSizePreset, useSizePresets } from "./useSizePresets";

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
 * 自上而下：生成参数（每个下拉都有看得见的标签）→ 结果画布 → 提示词与参考图；主按钮「生成图片」
 * 在底部，⌘/Ctrl + Enter 也能生成。以前是聊天式输入框：发送是输入框角落里一个箭头、上传是一个
 * 不带文字的「+」，几个下拉只有读屏才知道是什么。上传了参考图就按图生图处理，底部提示会跟着变。
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

  const handleProviderChange = useCallback(
    (provider: string) => {
      setSelectedProvider(provider);
      // The current model usually belongs to the previous provider, so it is
      // reselected rather than left pointing at something this provider cannot serve.
      setSelectedModel(resolveInitialModel(catalog, provider, null));
    },
    [catalog],
  );

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
      size: sizes.size,
      quality,
      n: count,
    };
    setPreviewOpen(false);
    void task.generate(
      requestMode === "edits"
        ? { mode: "edits", ...base, images: references.map((item) => item.file) }
        : { mode: "generations", ...base },
    );
  };

  // 服务商不止一个时，服务商 + 模型独占一行，其余三项在下一行；只有一个时四项排一行。
  const multiProvider = catalog.providers.length > 1;
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
        description={t("image_generation.test_modal_desc")}
        icon={<ImagePlay />}
        size="lg"
        // 画布、提示词、参考图一屏放得下：正文不另设 70vh 上限，由面板的视口上限兜底。
        bodyHeightClassName="max-h-none"
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
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div
            className={[
              "grid grid-cols-2 gap-x-3 gap-y-1",
              multiProvider ? "sm:grid-cols-3" : "sm:grid-cols-4",
            ].join(" ")}
          >
            <div className={multiProvider ? "col-span-2 sm:col-span-3" : "col-span-2 sm:col-span-1"}>
              <ImageModelPicker
                catalog={catalog}
                provider={selectedProvider}
                model={activeModel}
                disabled={task.submitting || catalogLoading}
                onProviderChange={handleProviderChange}
                onModelChange={setSelectedModel}
              />
            </div>
            <FormField label={t("image_generation.size_label")} reserveMeta={false}>
              <SearchableSelect
                aria-label={t("image_generation.size_label")}
                value={sizes.size}
                onChange={sizes.setSize}
                options={sizes.options}
                allowCreate
                normalizeCreateValue={normalizeImageGenerationSizePreset}
                createLabel={(value) => {
                  const normalized = normalizeImageGenerationSizePreset(value) || value.trim();
                  return (
                    <span className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate">
                        {t("image_generation.size_create_option", { size: normalized })}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-ink-3">
                        {t("image_generation.size_create_confirm")}
                      </span>
                    </span>
                  );
                }}
                onCreate={sizes.createPreset}
                searchPlaceholder={t("image_generation.size_search_placeholder")}
                className="w-full"
              />
            </FormField>
            <FormField label={t("image_generation.quality_label")} reserveMeta={false}>
              <Select
                aria-label={t("image_generation.quality_label")}
                value={quality}
                onChange={(value) => setQuality(value as QualityOption)}
                options={QUALITY_OPTIONS.map((value) => ({ value, label: value }))}
              />
            </FormField>
            <FormField label={t("image_generation.count_label")} reserveMeta={false}>
              <Select
                aria-label={t("image_generation.count_label")}
                value={String(count)}
                onChange={(value) => setCount(Number(value) as (typeof COUNT_OPTIONS)[number])}
                options={COUNT_OPTIONS.map((value) => ({
                  value: String(value),
                  label: t("image_generation.count_option", { count: value }),
                }))}
              />
            </FormField>
          </div>

          <ImageResultStage
            submitting={task.submitting}
            images={task.images}
            activeIndex={task.activeImageIndex}
            onActiveIndexChange={task.setActiveImageIndex}
            errorMessage={task.errorMessage}
            statusText={t(task.statusKey)}
            elapsedLabel={task.elapsedLabel}
            hasUploads={references.length > 0}
            editing={requestMode === "edits"}
            model={activeModel}
            onPreview={() => setPreviewOpen(true)}
          />

          <div data-testid="image-generation-composer" className="space-y-4">
            <FormField
              htmlFor="image-generation-prompt"
              label={t("image_generation.prompt_label")}
              required
              description={t(
                requestMode === "edits"
                  ? "image_generation.param_edit_prompt_desc"
                  : "image_generation.param_prompt_desc",
              )}
              error={validation.error("prompt")}
            >
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                {...validation.bind("prompt")}
                placeholder={t("image_generation.prompt_placeholder")}
                rows={3}
                className="min-h-24"
              />
            </FormField>

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
        </form>
      </Modal>

      <ImagePreviewOverlay
        open={previewOpen && Boolean(activeImage)}
        imageSrc={activeImage?.src ?? null}
        imageAlt={t("image_generation.preview_alt", { model: activeModel })}
        title={t("image_generation.image_preview_title")}
        downloadName={`${activeModel}-${task.activeImageIndex + 1}.png`}
        images={task.images.map((image, index) => ({
          src: image.src,
          alt: t("image_generation.preview_alt", { model: activeModel }),
          downloadName: `${activeModel}-${index + 1}.png`,
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
