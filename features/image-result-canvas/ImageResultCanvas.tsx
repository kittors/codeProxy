import { useRef, useState, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/** One generated image as the canvas shows it. */
export interface CanvasImage {
  src: string;
  alt: string;
  /** Encoding the server reported, e.g. "jpeg"; shown next to the pixel size. */
  format?: string;
}

export type CanvasState = "idle" | "generating" | "ready" | "error";

// 浮在画布 / 图片上的小部件（计时、计数、翻页、像素）：半透明浮层底 + 阴影描边（shadow-control），
// 不画 border，任何底色上都看得清。
const FLOATING = "bg-elevated/80 text-ink-2 shadow-control backdrop-blur-md";
const PILL = "absolute z-20 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums";

/**
 * 测试生图弹窗里的结果画布，生图页的「测试生成」和模型目录的「测试」共用。
 *
 * 画布的尺寸只由调用方给的 className 决定，从不跟着图片走：8:1 的横幅、1:8 的长条都按比例
 * 缩进画布、居中显示，弹窗不会被结果撑开、挤压或变形。以前图片按「宽度铺满、高度随意」放在
 * 可滚动区域里，竖长图只露出顶端一截，横幅贴在顶上留一大片空白。
 *
 * 图片加载后读出真实像素标在图上：比例和分辨率档位只是请求，上游实际出多大以这里为准。
 */
export function ImageResultCanvas({
  testIdPrefix,
  state,
  images,
  activeIndex,
  onActiveIndexChange,
  onPreview,
  idleText,
  statusText,
  statusDetail,
  errorMessage,
  elapsedLabel,
  className,
}: {
  /** Prefix of the data-testid hooks, e.g. "image-generation" gives "image-generation-stage". */
  testIdPrefix: string;
  state: CanvasState;
  images: CanvasImage[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onPreview: () => void;
  idleText: string;
  statusText?: string;
  statusDetail?: string;
  errorMessage?: string;
  elapsedLabel?: string | null;
  /** Size of the canvas box. The content never changes it. */
  className?: string;
}) {
  const { t } = useTranslation();
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const activeImage = state === "ready" ? (images[activeIndex] ?? null) : null;
  const multiple = activeImage !== null && images.length > 1;

  // 记录和它所属的那一批结果绑在一起：换了一批图，旧记录自然作废，不用 effect 清空。
  const [measured, setMeasured] = useState<{ images: CanvasImage[]; sizes: Record<number, string> }>(
    () => ({ images, sizes: {} }),
  );
  const pixelSizes = measured.images === images ? measured.sizes : {};
  const recordPixelSize = (index: number, width: number, height: number) => {
    if (width <= 0 || height <= 0) return;
    setMeasured((current) => ({
      images,
      sizes: { ...(current.images === images ? current.sizes : {}), [index]: `${width} × ${height}` },
    }));
  };

  const showImageAt = (index: number) => {
    onActiveIndexChange(Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || !multiple) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    showImageAt(activeIndex + (deltaX < 0 ? 1 : -1));
  };

  const pixelSize = activeImage ? pixelSizes[activeIndex] : undefined;

  return (
    <div
      data-testid={`${testIdPrefix}-stage`}
      data-state={state}
      aria-live="polite"
      className={["relative isolate overflow-hidden rounded-2xl bg-subtle", className ?? ""].join(" ")}
    >
      {state === "generating" ? (
        <>
          <div className="image-generation-dots-layer" />
          <div className="image-generation-flow-layer" />
        </>
      ) : null}

      {activeImage ? (
        <div
          className="absolute inset-0 z-10"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
        >
          <div
            data-testid={`${testIdPrefix}-carousel-track`}
            className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIndex === 0 ? 0 : -activeIndex * 100}%)` }}
          >
            {images.map((image, index) => (
              <div
                key={`canvas-image-${index}`}
                aria-hidden={index !== activeIndex}
                className="flex h-full w-full shrink-0 items-center justify-center p-4 sm:p-5"
              >
                <img
                  src={image.src}
                  alt={image.alt}
                  draggable={false}
                  onClick={onPreview}
                  onLoad={(event) =>
                    recordPixelSize(
                      index,
                      event.currentTarget.naturalWidth,
                      event.currentTarget.naturalHeight,
                    )
                  }
                  className="max-h-full max-w-full cursor-zoom-in select-none rounded-lg object-contain"
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative z-10 flex h-full w-full items-center justify-center p-6 text-center">
          {state === "generating" ? (
            <div className="max-w-sm">
              <p className="text-2xl font-semibold tracking-tight text-ink-2 sm:text-3xl">
                {statusText}
              </p>
              {statusDetail ? <p className="mt-2 text-sm text-ink-3">{statusDetail}</p> : null}
            </div>
          ) : state === "error" ? (
            // 画布保持中性底，只把原因放进一块淡玫红的提示：整块画布染红太刺眼，
            // 和面板里其它危险提示条也不是一个样子。
            <div className="flex max-h-full max-w-md items-start gap-2.5 overflow-auto rounded-xl bg-rose-500/[0.08] px-4 py-3 text-left">
              <CircleAlert
                size={16}
                className="mt-1 shrink-0 text-rose-600 dark:text-rose-400"
                aria-hidden="true"
              />
              <p className="min-w-0 break-words text-sm leading-6 text-ink-2">{errorMessage}</p>
            </div>
          ) : (
            <div className="max-w-xs text-ink-3">
              <ImageIcon size={28} strokeWidth={1.6} className="mx-auto opacity-70" aria-hidden="true" />
              <p className="mt-3 text-sm leading-6">{idleText}</p>
            </div>
          )}
        </div>
      )}

      {elapsedLabel ? <div className={`${PILL} ${FLOATING} left-3 top-3`}>{elapsedLabel}</div> : null}

      {multiple ? (
        <>
          <div data-testid={`${testIdPrefix}-counter`} className={`${PILL} ${FLOATING} right-3 top-3`}>
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

      {activeImage && pixelSize ? (
        <div data-testid={`${testIdPrefix}-pixel-size`} className={`${PILL} ${FLOATING} bottom-3 left-3`}>
          {pixelSize}
          {activeImage.format ? ` · ${activeImage.format.toUpperCase()}` : ""}
        </div>
      ) : null}

      {activeImage ? (
        // 浮在图片上：固定用半透明黑底白字，任何底色的图上都看得清。
        <button
          type="button"
          onClick={onPreview}
          className="absolute bottom-3 right-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
        >
          {t("image_generation.open_preview")}
        </button>
      ) : null}
    </div>
  );
}
