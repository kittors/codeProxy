import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { imageGenerationApi } from "@code-proxy/api-client";
import { useToast, type SearchableSelectOption } from "@code-proxy/ui";
import {
  DEFAULT_SIZE_OPTION,
  DEFAULT_SIZE_OPTIONS,
  IMAGE_GENERATION_MAX_SIZE_EDGE,
  IMAGE_GENERATION_MAX_SIZE_PIXELS,
  IMAGE_GENERATION_SIZE_PATTERN,
  SIZE_OPTIONS,
} from "./generationOptions";

/**
 * 测试弹窗里的分辨率：内置几档 + 服务端保存的自定义尺寸。
 *
 * 下拉里可以直接输入「宽x高」新增一档（立即保存到服务端），自定义的那几档可以删除，
 * 删除后 toast 里给「撤销」。保存失败时回滚本地列表。
 * 从 ImageGenerationPageContent 拆出（那个文件卡在行数棘轮上），逻辑原样搬过来。
 */

export function normalizeImageGenerationSizePreset(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, "");
  return IMAGE_GENERATION_SIZE_PATTERN.test(normalized) ? normalized : "";
}

function parseImageGenerationSizePreset(value: string): { width: number; height: number } | null {
  const normalized = normalizeImageGenerationSizePreset(value);
  if (!normalized) return null;
  const [widthText, heightText] = normalized.split("x");
  const width = Number.parseInt(widthText, 10);
  const height = Number.parseInt(heightText, 10);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

function isImageGenerationSizePresetWithinLimit(value: string): boolean {
  const size = parseImageGenerationSizePreset(value);
  if (!size) return false;
  return (
    size.width <= IMAGE_GENERATION_MAX_SIZE_EDGE &&
    size.height <= IMAGE_GENERATION_MAX_SIZE_EDGE &&
    size.width * size.height <= IMAGE_GENERATION_MAX_SIZE_PIXELS
  );
}

function mergeImageGenerationSizePresets(values: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of [...SIZE_OPTIONS, ...values]) {
    const normalized = normalizeImageGenerationSizePreset(value);
    if (
      !normalized ||
      !isImageGenerationSizePresetWithinLimit(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }
    seen.add(normalized);
    merged.push(normalized);
  }
  return merged;
}

export function useSizePresets(open: boolean) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [size, setSize] = useState<string>(DEFAULT_SIZE_OPTION);
  const [sizePresets, setSizePresets] = useState<string[]>(() =>
    mergeImageGenerationSizePresets([]),
  );

  useEffect(() => {
    if (!open) return;
    setSize(DEFAULT_SIZE_OPTION);
    let cancelled = false;

    const loadSizePresets = async () => {
      try {
        const response = await imageGenerationApi.getSizePresets();
        if (cancelled) return;
        setSizePresets(mergeImageGenerationSizePresets(response.sizes ?? []));
      } catch {
        if (!cancelled) {
          setSizePresets(mergeImageGenerationSizePresets([]));
        }
      }
    };

    void loadSizePresets();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const createPreset = useCallback(
    async (value: string) => {
      const nextSize = normalizeImageGenerationSizePreset(value);
      if (!nextSize) {
        notify({
          type: "warning",
          message: t("image_generation.size_preset_invalid"),
        });
        return;
      }
      if (!isImageGenerationSizePresetWithinLimit(nextSize)) {
        notify({
          type: "warning",
          message: t("image_generation.size_preset_too_large"),
        });
        return;
      }

      const previousPresets = sizePresets;
      const nextPresets = mergeImageGenerationSizePresets([...sizePresets, nextSize]);
      setSizePresets(nextPresets);
      setSize(nextSize);

      try {
        const response = await imageGenerationApi.updateSizePresets(nextPresets);
        setSizePresets(mergeImageGenerationSizePresets(response.sizes ?? nextPresets));
        notify({
          type: "success",
          message: t("image_generation.size_preset_saved", { size: nextSize }),
        });
      } catch (error) {
        setSizePresets(previousPresets);
        setSize((current) => (current === nextSize ? DEFAULT_SIZE_OPTION : current));
        notify({
          type: "error",
          message:
            error instanceof Error ? error.message : t("image_generation.size_preset_save_failed"),
        });
      }
    },
    [notify, sizePresets, t],
  );

  const deletePreset = useCallback(
    async (value: string) => {
      const targetSize = normalizeImageGenerationSizePreset(value);
      if (!targetSize || DEFAULT_SIZE_OPTIONS.has(targetSize)) return;

      const previousPresets = sizePresets;
      const previousSize = size;
      const nextPresets = sizePresets.filter((item) => item !== targetSize);
      const sizeAfterDelete = previousSize === targetSize ? DEFAULT_SIZE_OPTION : previousSize;
      setSizePresets(nextPresets);
      setSize(sizeAfterDelete);

      const restorePreset = () => {
        setSizePresets(previousPresets);
        setSize(previousSize);
        void imageGenerationApi
          .updateSizePresets(previousPresets)
          .then((response) => {
            setSizePresets(mergeImageGenerationSizePresets(response.sizes ?? previousPresets));
            setSize(previousSize);
          })
          .catch((error) => {
            setSizePresets(nextPresets);
            setSize(sizeAfterDelete);
            notify({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : t("image_generation.size_preset_save_failed"),
            });
          });
      };

      try {
        const response = await imageGenerationApi.updateSizePresets(nextPresets);
        setSizePresets(mergeImageGenerationSizePresets(response.sizes ?? nextPresets));
        notify({
          type: "success",
          message: t("image_generation.size_preset_deleted", { size: targetSize }),
          duration: 4000,
          action: {
            label: t("image_generation.size_preset_undo"),
            onClick: restorePreset,
            successLabel: t("image_generation.size_preset_restored", { size: targetSize }),
          },
        });
      } catch (error) {
        setSizePresets(previousPresets);
        setSize(previousSize);
        notify({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : t("image_generation.size_preset_delete_failed"),
        });
      }
    },
    [notify, size, sizePresets, t],
  );

  const options = useMemo<SearchableSelectOption[]>(
    () =>
      sizePresets.map((value) => {
        const custom = !DEFAULT_SIZE_OPTIONS.has(value);
        return {
          value,
          label: value,
          triggerLabel: value,
          searchText: value,
          action: custom
            ? {
                label: t("image_generation.size_delete_label", { size: value }),
                icon: <Trash2 size={13} aria-hidden="true" />,
                onClick: () => {
                  void deletePreset(value);
                },
              }
            : undefined,
        };
      }),
    [deletePreset, sizePresets, t],
  );

  return { size, setSize, options, createPreset };
}
