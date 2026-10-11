import { useTranslation } from "react-i18next";
import { FormField, SearchableSelect, Select } from "@code-proxy/ui";
import type { ImageShapeOptions } from "@features/image-model-picker";
import {
  AUTO_ASPECT_RATIO,
  COUNT_OPTIONS,
  QUALITY_OPTIONS,
  type QualityOption,
} from "./generationOptions";
import { normalizeImageGenerationSizePreset, type useSizePresets } from "./useSizePresets";

type CountOption = (typeof COUNT_OPTIONS)[number];

/**
 * 生成参数：一行三个下拉，标签在上，宽度均分。
 *
 * Gemini 生图模型按「比例 + 分辨率档位」出图，其它模型按「分辨率（宽x高）+ 质量」，两套各自
 * 一行，只显示所选模型认的那一套；「生成数量」两边都有，放在最后。每一格都是 min-w-0：
 * 网格的默认最小宽度是内容宽度，长的选项会把一格撑出去、压到旁边的下拉上。
 */
export function ImageParameterFields({
  shape,
  aspectRatio,
  onAspectRatioChange,
  imageSize,
  onImageSizeChange,
  sizes,
  quality,
  onQualityChange,
  count,
  onCountChange,
}: {
  shape: ImageShapeOptions | null;
  aspectRatio: string;
  onAspectRatioChange: (value: string) => void;
  imageSize: string;
  onImageSizeChange: (value: string) => void;
  sizes: ReturnType<typeof useSizePresets>;
  quality: QualityOption;
  onQualityChange: (value: QualityOption) => void;
  count: CountOption;
  onCountChange: (value: CountOption) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-3 gap-2.5" data-testid="image-generation-parameters">
      {shape ? (
        <>
          <FormField label={t("image_generation.aspect_ratio_label")} reserveMeta={false} className="min-w-0">
            <Select
              aria-label={t("image_generation.aspect_ratio_label")}
              value={aspectRatio}
              onChange={onAspectRatioChange}
              options={[
                { value: AUTO_ASPECT_RATIO, label: t("image_generation.aspect_ratio_auto") },
                ...shape.aspectRatios.map((value) => ({ value, label: value })),
              ]}
            />
          </FormField>
          <FormField label={t("image_generation.image_size_label")} reserveMeta={false} className="min-w-0">
            <Select
              aria-label={t("image_generation.image_size_label")}
              value={imageSize}
              onChange={onImageSizeChange}
              options={shape.imageSizes.map((value) => ({ value, label: value }))}
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField label={t("image_generation.size_label")} reserveMeta={false} className="min-w-0">
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
          <FormField label={t("image_generation.quality_label")} reserveMeta={false} className="min-w-0">
            <Select
              aria-label={t("image_generation.quality_label")}
              value={quality}
              onChange={(value) => onQualityChange(value as QualityOption)}
              options={QUALITY_OPTIONS.map((value) => ({ value, label: value }))}
            />
          </FormField>
        </>
      )}
      <FormField label={t("image_generation.count_label")} reserveMeta={false} className="min-w-0">
        <Select
          aria-label={t("image_generation.count_label")}
          value={String(count)}
          onChange={(value) => onCountChange(Number(value) as CountOption)}
          options={COUNT_OPTIONS.map((value) => ({
            value: String(value),
            label: t("image_generation.count_option", { count: value }),
          }))}
        />
      </FormField>
    </div>
  );
}
