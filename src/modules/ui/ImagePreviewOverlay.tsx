import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Download, RotateCcw, RotateCw, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const normalized = normalizeQuarterTurns(quarterTurns);
  if (normalized === 3) return -90;
  return normalized * 90;
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
}: {
  open: boolean;
  imageSrc: string | null;
  imageAlt: string;
  title: string;
  onClose: () => void;
  downloadName?: string;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const movedRef = useRef(false);
  const [scale, setScale] = useState(1);
  const [quarterTurns, setQuarterTurns] = useState(0);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    if (!open) return;
    setScale(1);
    setQuarterTurns(0);
    dragRef.current = null;
  }, [imageSrc, open]);

  useEffect(() => {
    if (!open) return;
    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth || 1280,
        height: window.innerHeight || 800,
      });
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const geometry = useMemo(() => {
    const naturalWidth = naturalSize.width || 1;
    const naturalHeight = naturalSize.height || 1;
    const rotated = normalizeQuarterTurns(quarterTurns) % 2 === 1;
    const effectiveWidth = rotated ? naturalHeight : naturalWidth;
    const effectiveHeight = rotated ? naturalWidth : naturalHeight;
    const maxWidth = Math.max(320, viewportSize.width - VIEWPORT_PADDING_X);
    const maxHeight = Math.max(240, viewportSize.height - VIEWPORT_PADDING_Y);
    const fitScale = Math.min(maxWidth / effectiveWidth, maxHeight / effectiveHeight, 1);
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
  }, [naturalSize.height, naturalSize.width, quarterTurns, scale, viewportSize.height, viewportSize.width]);

  if (!open || !imageSrc) return null;

  const canZoomOut = scale > MIN_SCALE;
  const canZoomIn = scale < MAX_SCALE;
  const resolvedDownloadName = downloadName || buildDownloadName(title);

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

  const controlButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-white/70 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white/78 dark:hover:bg-white/12 dark:hover:text-white";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-variant="image-only"
      className="fixed inset-0 z-[220] bg-slate-900/40 backdrop-blur-sm dark:bg-black/50"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur transition-colors hover:bg-black/55 hover:text-white sm:top-5 sm:right-5"
        aria-label={t("common.close")}
      >
        <X size={18} />
      </button>

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
      >
        <div className="inline-flex min-h-full min-w-full items-center justify-center p-6 sm:p-10">
          <div
            className="relative shrink-0"
            style={{ width: geometry.boxWidth, height: geometry.boxHeight }}
          >
            <img
              src={imageSrc}
              alt={imageAlt}
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
                transition: "transform 160ms ease, width 160ms ease, height 160ms ease",
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-0 bottom-5 left-0 z-20 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/25 bg-white/68 p-1.5 shadow-[0_16px_48px_rgba(15,23,42,0.22)] backdrop-blur-xl dark:border-white/12 dark:bg-neutral-950/55">
          <button
            type="button"
            className={controlButtonClass}
            onClick={() => setScale((current) => clamp(current - SCALE_STEP, MIN_SCALE, MAX_SCALE))}
            disabled={!canZoomOut}
            title={t("common.zoom_out")}
            aria-label={t("common.zoom_out")}
          >
            <ZoomOut size={17} />
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={() => setScale((current) => clamp(current + SCALE_STEP, MIN_SCALE, MAX_SCALE))}
            disabled={!canZoomIn}
            title={t("common.zoom_in")}
            aria-label={t("common.zoom_in")}
          >
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={() => setQuarterTurns((current) => normalizeQuarterTurns(current - 1))}
            title={t("common.rotate_left")}
            aria-label={t("common.rotate_left")}
          >
            <RotateCcw size={17} />
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={() => setQuarterTurns((current) => normalizeQuarterTurns(current + 1))}
            title={t("common.rotate_right")}
            aria-label={t("common.rotate_right")}
          >
            <RotateCw size={17} />
          </button>
          <button
            type="button"
            className={controlButtonClass}
            onClick={() => {
              setScale(1);
              setQuarterTurns(0);
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ left: 0, top: 0, behavior: "smooth" });
              }
            }}
            title={t("common.reset_image")}
            aria-label={t("common.reset_image")}
          >
            <Scan size={17} />
          </button>
          <a
            className={controlButtonClass}
            href={imageSrc}
            download={resolvedDownloadName}
            title={t("log_content.download")}
            aria-label={t("log_content.download")}
            onClick={(event) => event.stopPropagation()}
          >
            <Download size={17} />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
