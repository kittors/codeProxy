import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, surface } from "@code-proxy/ui";

export type UploadedImage = { id: string; file: File; previewUrl: string };

/**
 * 参考图片（可选）：传了就按图生图处理。缩略图可以点开预览、悬停或键盘聚焦时出现删除；
 * 「上传参考图」是一个看得见、按得到的按钮——以前是输入框角落里一个不带文字的「+」。
 * 文件选择框本身藏起来、不进 Tab 顺序，由按钮代为打开。
 */
export function ReferenceImagesField({
  images,
  max,
  onAdd,
  onRemove,
  onPreview,
}: {
  images: UploadedImage[];
  max: number;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onPreview: (index: number) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const full = images.length >= max;

  return (
    <div className="space-y-2.5">
      {/* 一行就够：按钮本身说清是什么，旁边一句说明它会把请求变成图生图。
          以前单独占一个带标题的字段，弹窗一屏放不下，要滚动才看得到这个入口。 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="secondary"
          size="sm"
          data-testid="image-generation-upload-trigger"
          onClick={() => inputRef.current?.click()}
          disabled={full}
        >
          <ImagePlus size={15} aria-hidden="true" />
          {t("image_generation.upload_label")}
        </Button>
        <p className="min-w-0 flex-1 text-xs leading-5 text-ink-3">
          {t("image_generation.reference_image_hint", { max })}
        </p>
        <span className="text-xs tabular-nums text-ink-3">
          {images.length} / {max}
        </span>
      </div>
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="image-generation-upload-strip">
          {images.map((item, index) => (
            <div
              key={item.id}
              data-testid="image-generation-upload-chip"
              className={[
                surface({ tone: "inset", radius: "xl" }),
                "group flex h-10 max-w-[220px] shrink-0 items-center gap-2 px-1.5",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => onPreview(index)}
                className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                aria-label={t("image_generation.preview_upload_label", { name: item.file.name })}
              >
                {/* 缩略图的轮廓用伪元素细边（cp-edge）画在图片上面，不用 border。 */}
                <span className="cp-edge h-7 w-7 shrink-0 overflow-hidden rounded-lg bg-surface">
                  <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                </span>
                <span className="truncate">{item.file.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-rose-500/10 hover:text-rose-600 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:text-rose-400"
                aria-label={t("image_generation.remove_upload_label", { name: item.file.name })}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        id="image-generation-reference"
        aria-label={t("image_generation.upload_images_label")}
        type="file"
        accept="image/*"
        multiple
        disabled={full}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          onAdd(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
