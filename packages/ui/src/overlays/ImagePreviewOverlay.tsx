import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { hideTip, resetTipLayer } from "satin-ui";
import { Icon } from "satin-ui/react";
import { useTranslation } from "react-i18next";
import { OVERLAY_EXIT_MS } from "../utils/motion";
import { useOverlayPresence } from "./overlayMotion";
import { notifyTopLayerDialogOpened } from "./portalContainer";
import { useDialogBehavior } from "./useDialogBehavior";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;
const VIEWPORT_PADDING_X = 48;
const VIEWPORT_PADDING_Y = 128;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeQuarterTurns(value: number) {
  return ((value % 4) + 4) % 4;
}

function rotationDegrees(quarterTurns: number) {
  return quarterTurns * 90;
}

function nearestUprightQuarterTurns(current: number) {
  const normalized = normalizeQuarterTurns(current);
  if (normalized === 0) return current;
  const backward = -normalized;
  const forward = 4 - normalized;
  return current + (Math.abs(backward) <= Math.abs(forward) ? backward : forward);
}

function buildDownloadName(model?: string) {
  const safeModel = (model || "image").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeModel || "image"}-${Date.now()}.png`;
}

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
  const activeImage = resolvedImages[resolvedActiveIndex] ?? null;
  const resolvedImageSrc = activeImage?.src ?? imageSrc;
  const resolvedImageAlt = activeImage?.alt ?? imageAlt;
  const resolvedDownloadName =
    activeImage?.downloadName || downloadName || buildDownloadName(title);
  const canGoPrev = resolvedImages.length > 1 && resolvedActiveIndex > 0;
  const canGoNext = resolvedImages.length > 1 && resolvedActiveIndex < resolvedImages.length - 1;

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const movedRef = useRef(false);
  const previousMetricsRef = useRef<{
    scale: number;
    quarterTurns: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 800 });

  // 没有图时组件什么也不渲染，也就不能占着叠层的最上层（否则下面弹窗的 Esc 会失灵）。
  const shown = open && Boolean(resolvedImageSrc);
  const { mounted, visible } = useOverlayPresence(shown, OVERLAY_EXIT_MS);

  // 关闭退场期间快照当前图片，防止父组件清空 src 导致画面瞬间消失。
  const snapshotRef = useRef({
    src: resolvedImageSrc,
    alt: resolvedImageAlt,
    title,
    downloadName: resolvedDownloadName,
  });
  if (shown && resolvedImageSrc) {
    snapshotRef.current = {
      src: resolvedImageSrc,
      alt: resolvedImageAlt,
      title,
      downloadName: resolvedDownloadName,
    };
  }
  const snapshot = snapshotRef.current;

  useEffect(() => {
    if (!shown) return;
    setScale(1);
    setQuarterTurns(0);
    dragRef.current = null;
    previousMetricsRef.current = null;
  }, [resolvedImageSrc, shown]);

  useEffect(() => {
    if (!shown) return;
    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [shown]);

  // 预览常常是从弹窗里打开的（日志内容、生图测试）：原生 <dialog>.showModal() 天然叠在
  // 下层 <Modal> 之上，同时登记进同一个叠层管理 Esc、Tab 循环与焦点归还。
  useDialogBehavior({
    open: shown,
    visible: shown && visible,
    panelRef: dialogRef,
    onEscape: onClose,
    initialFocus: "panel",
  });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!mounted || !dialog) return;

    if (shown) {
      if (!dialog.open) {
        try {
          resetTipLayer();
        } catch {
          // ignore
        }
        if (typeof dialog.showModal === "function") {
          try {
            dialog.showModal();
          } catch {
            dialog.setAttribute("open", "");
          }
        } else {
          dialog.setAttribute("open", "");
        }
        notifyTopLayerDialogOpened();
      }
    } else {
      try {
        hideTip();
      } catch {
        // ignore
      }
    }
  }, [mounted, shown]);

  useEffect(() => {
    if (!mounted) return;
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open && typeof dialog.close === "function") {
        try {
          dialog.close();
        } catch {
          // ignore
        }
      }
    };
  }, [mounted]);

  const geometry = useMemo(() => {
    const naturalWidth = naturalSize.width || 1;
    const naturalHeight = naturalSize.height || 1;
    const rotated = normalizeQuarterTurns(quarterTurns) % 2 === 1;
    const maxWidth = Math.max(320, viewportSize.width - VIEWPORT_PADDING_X);
    const maxHeight = Math.max(240, viewportSize.height - VIEWPORT_PADDING_Y);
    const fitScale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    const baseWidth = naturalWidth * fitScale;
    const baseHeight = naturalHeight * fitScale;
    const boxWidth = (rotated ? baseHeight : baseWidth) * scale;
    const boxHeight = (rotated ? baseWidth : baseHeight) * scale;

    return {
      imageWidth: baseWidth * scale,
      imageHeight: baseHeight * scale,
      boxWidth,
      boxHeight,
    };
  }, [
    naturalSize.height,
    naturalSize.width,
    quarterTurns,
    scale,
    viewportSize.height,
    viewportSize.width,
  ]);

  useLayoutEffect(() => {
    if (!shown) return;
    const element = scrollRef.current;
    if (!element) return;

    const previous = previousMetricsRef.current;
    if (previous && (previous.scale !== scale || previous.quarterTurns !== quarterTurns)) {
      const previousCenterX = previous.scrollLeft + previous.clientWidth / 2;
      const previousCenterY = previous.scrollTop + previous.clientHeight / 2;
      const ratioX =
        previous.scrollWidth > previous.clientWidth ? previousCenterX / previous.scrollWidth : 0.5;
      const ratioY =
        previous.scrollHeight > previous.clientHeight
          ? previousCenterY / previous.scrollHeight
          : 0.5;
      const maxLeft = Math.max(0, element.scrollWidth - element.clientWidth);
      const maxTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollLeft = clamp(
        ratioX * element.scrollWidth - element.clientWidth / 2,
        0,
        maxLeft,
      );
      element.scrollTop = clamp(
        ratioY * element.scrollHeight - element.clientHeight / 2,
        0,
        maxTop,
      );
    }

    previousMetricsRef.current = {
      scale,
      quarterTurns,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    };
  }, [geometry.boxHeight, geometry.boxWidth, quarterTurns, scale, shown]);

  if (!mounted || !snapshot.src) return null;

  const canZoomOut = scale > MIN_SCALE;
  const canZoomIn = scale < MAX_SCALE;

  const changeImage = (nextIndex: number) => {
    if (!onActiveIndexChange) return;
    onActiveIndexChange(clamp(nextIndex, 0, Math.max(resolvedImages.length - 1, 0)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!element) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
    };
    movedRef.current = false;
    element.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    const drag = dragRef.current;
    if (!element || !drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.x) > 4 || Math.abs(event.clientY - drag.y) > 4) {
      movedRef.current = true;
    }
    element.scrollLeft = drag.left - (event.clientX - drag.x);
    element.scrollTop = drag.top - (event.clientY - drag.y);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    const drag = dragRef.current;
    if (!element || !drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    element.releasePointerCapture(event.pointerId);
  };

  // 使用 Satin 玻璃控制条与按压微缩放按钮（.sn-glass + .sn-pb）。
  const controlButtonClass = "sn-pb disabled:cursor-not-allowed disabled:opacity-35";

  return createPortal(
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={snapshot.title}
      tabIndex={-1}
      data-variant="image-only"
      onCancel={(event) => event.preventDefault()}
      className={[
        "cp-image-preview",
        visible ? "sn-shown" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={[
          "relative h-full w-full transition-[opacity,transform] motion-reduce:transition-none",
          visible
            ? "scale-100 opacity-100 duration-[260ms] ease-[var(--sn-ease-out-strong)]"
            : "scale-[0.97] opacity-0 duration-[180ms] ease-[var(--sn-ease-in)]",
        ].join(" ")}
      >
        <div className="sn-glass absolute top-4 right-4 z-20 rounded-full p-1 sm:top-5 sm:right-5">
          <button
            type="button"
            onClick={onClose}
            className="sn-pb !rounded-full"
            aria-label={t("common.close")}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="h-full w-full cursor-grab overflow-auto overscroll-contain active:cursor-grabbing"
          onClick={(event) => {
            if (event.target !== event.currentTarget && !movedRef.current) return;
            if (movedRef.current) {
              movedRef.current = false;
              return;
            }
            onClose();
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onScroll={() => {
            const element = scrollRef.current;
            const previous = previousMetricsRef.current;
            if (!element || !previous) return;
            previousMetricsRef.current = {
              ...previous,
              scrollWidth: element.scrollWidth,
              scrollHeight: element.scrollHeight,
              clientWidth: element.clientWidth,
              clientHeight: element.clientHeight,
              scrollLeft: element.scrollLeft,
              scrollTop: element.scrollTop,
            };
          }}
        >
          <div className="inline-flex min-h-full min-w-full items-center justify-center p-6 sm:p-10">
            <div
              className="relative shrink-0"
              style={{ width: geometry.boxWidth, height: geometry.boxHeight }}
            >
              <img
                src={snapshot.src}
                alt={snapshot.alt}
                draggable={false}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  setNaturalSize({
                    width: image.naturalWidth || image.width || 1,
                    height: image.naturalHeight || image.height || 1,
                  });
                }}
                className="absolute top-1/2 left-1/2 block max-w-none select-none"
                style={{
                  width: geometry.imageWidth,
                  height: geometry.imageHeight,
                  transform: `translate(-50%, -50%) rotate(${rotationDegrees(quarterTurns)}deg)`,
                  transformOrigin: "center",
                  transition: "transform 160ms var(--sn-ease-out), width 160ms var(--sn-ease-out), height 160ms var(--sn-ease-out)",
                }}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute right-0 bottom-5 left-0 z-20 flex justify-center px-4">
          <div className="sn-glass pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5">
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => changeImage(resolvedActiveIndex - 1)}
              disabled={!canGoPrev}
              title={t("common.prev")}
              aria-label={t("common.prev")}
            >
              <Icon name="chevron-left" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => changeImage(resolvedActiveIndex + 1)}
              disabled={!canGoNext}
              title={t("common.next")}
              aria-label={t("common.next")}
            >
              <Icon name="chevron-right" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => setScale((current) => clamp(current - SCALE_STEP, MIN_SCALE, MAX_SCALE))}
              disabled={!canZoomOut}
              title={t("common.zoom_out")}
              aria-label={t("common.zoom_out")}
            >
              <Icon name="zoom-out" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => setScale((current) => clamp(current + SCALE_STEP, MIN_SCALE, MAX_SCALE))}
              disabled={!canZoomIn}
              title={t("common.zoom_in")}
              aria-label={t("common.zoom_in")}
            >
              <Icon name="zoom-in" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => setQuarterTurns((current) => current - 1)}
              title={t("common.rotate_left")}
              aria-label={t("common.rotate_left")}
            >
              <Icon name="rotate-ccw" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => setQuarterTurns((current) => current + 1)}
              title={t("common.rotate_right")}
              aria-label={t("common.rotate_right")}
            >
              <Icon name="rotate-cw" size={17} />
            </button>
            <button
              type="button"
              className={controlButtonClass}
              onClick={() => {
                setScale(1);
                setQuarterTurns((current) => nearestUprightQuarterTurns(current));
                if (scrollRef.current) {
                  scrollRef.current.scrollTo({ left: 0, top: 0, behavior: "smooth" });
                }
              }}
              title={t("common.reset_image")}
              aria-label={t("common.reset_image")}
            >
              <Icon name="scan" size={17} />
            </button>
            <a
              className={controlButtonClass}
              href={snapshot.src ?? undefined}
              download={snapshot.downloadName}
              title={t("log_content.download")}
              aria-label={t("log_content.download")}
              onClick={(event) => event.stopPropagation()}
            >
              <Icon name="download" size={17} />
            </a>
          </div>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
