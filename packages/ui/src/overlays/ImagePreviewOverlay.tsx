import { useEffect, useMemo, useRef } from "react";
import { openLightbox, type LightboxHandle } from "satin-ui/lightbox";
import { useTranslation } from "react-i18next";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildDownloadName(model?: string) {
  const safeModel = (model || "image").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeModel || "image"}-${Date.now()}.png`;
}

/**
 * 全屏图片预览：底层 100% 委托 Satin 原生 `openLightbox`（`satin-ui/src/media/lightbox.js`）。
 * 原生享有 Top Layer `<dialog>` 叠放（可无障碍盖在任意 `<Modal>` 之上）、滚轮/捏合按鼠标中心缩放（50%–800%）、
 * 单击 2× 放大与适应窗口切换、90° 旋转自动窗口适配、越界 30% 橡皮筋阻尼拖拽、幽灵翻页动效与玻璃工具条。
 */
export function ImagePreviewOverlay({
  open,
  imageSrc,
  imageAlt,
  title,
  onClose,
  downloadName,
  images,
  activeIndex,
  onActiveIndexChange,
}: {
  open: boolean;
  imageSrc: string | null;
  imageAlt: string;
  title: string;
  onClose: () => void;
  downloadName?: string;
  images?: Array<{ src: string; alt?: string; downloadName?: string }>;
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
}) {
  const { t } = useTranslation();
  const resolvedImages = useMemo(() => {
    if (images && images.length > 0) return images;
    return imageSrc ? [{ src: imageSrc, alt: imageAlt, downloadName }] : [];
  }, [downloadName, imageAlt, imageSrc, images]);

  const resolvedActiveIndex = clamp(activeIndex ?? 0, 0, Math.max(resolvedImages.length - 1, 0));
  const shown = open && resolvedImages.length > 0;
  const itemsKey = useMemo(
    () =>
      resolvedImages
        .map((item) => `${item.src}|${item.alt ?? ""}|${item.downloadName ?? ""}`)
        .join("\u001f"),
    [resolvedImages],
  );

  const handleRef = useRef<LightboxHandle | null>(null);
  const currentIndexRef = useRef(resolvedActiveIndex);
  const closingFromPropRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onActiveIndexChangeRef = useRef(onActiveIndexChange);
  onActiveIndexChangeRef.current = onActiveIndexChange;

  const downloadLabel = t("log_content.download", { defaultValue: "Download" });

  useEffect(() => {
    if (!shown) return undefined;

    const satinItems = resolvedImages.map((item, idx) => ({
      src: item.src,
      alt: item.alt ?? imageAlt,
      downloadName:
        item.downloadName ||
        (idx === resolvedActiveIndex ? downloadName : undefined) ||
        buildDownloadName(title),
    }));

    currentIndexRef.current = resolvedActiveIndex;
    closingFromPropRef.current = false;

    const handle = openLightbox(satinItems, resolvedActiveIndex, {
      title,
      variant: "image-only",
      downloadLabel,
      onStep: (nextIndex) => {
        currentIndexRef.current = nextIndex;
        onActiveIndexChangeRef.current?.(nextIndex);
      },
      onClose: () => {
        if (handleRef.current === handle) handleRef.current = null;
        if (!closingFromPropRef.current) {
          onCloseRef.current();
        }
      },
    });
    handleRef.current = handle;

    return () => {
      closingFromPropRef.current = true;
      if (handleRef.current === handle) {
        handleRef.current = null;
        handle.close(true);
      }
    };
    // 仅在打开态或图片列表本身变化时重建 Lightbox；受控切图由下方 effect 通过 goTo 平滑过渡。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, itemsKey, title, downloadLabel]);

  useEffect(() => {
    if (!shown || !handleRef.current) return;
    if (resolvedActiveIndex === currentIndexRef.current) return;
    const dir = resolvedActiveIndex > currentIndexRef.current ? 1 : -1;
    currentIndexRef.current = resolvedActiveIndex;
    handleRef.current.goTo?.(resolvedActiveIndex, dir);
  }, [resolvedActiveIndex, shown]);

  return null;
}
