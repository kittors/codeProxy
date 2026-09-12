import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ShieldAlert, ShieldCheck } from "lucide-react";
import { ImagePreviewOverlay } from "@code-proxy/ui";
import type { ModelTestImage, ModelTestPayload, ModelTestResult } from "@code-proxy/api-client";
import { formatBytes } from "./modelTestModes";

/**
 * Renders a probe result in the shape of what came back.
 *
 * A `<pre>` was the whole output before, which is why an image model appeared to
 * "work": the base64 of a picture and a sentence of prose both render as text.
 */
export function ModelTestOutput({ result }: { result: ModelTestResult }) {
  const payload = result.result;
  if (!payload) {
    return result.content ? <TextOutput text={result.content} /> : null;
  }
  switch (payload.kind) {
    case "image":
      return <ImageOutput payload={payload} />;
    case "video":
      return <VideoOutput payload={payload} />;
    default:
      return <TextOutput text={payload.text || result.content || ""} />;
  }
}

function TextOutput({ text }: { text: string }) {
  const { t } = useTranslation();
  return (
    <pre
      data-testid="model-test-text"
      className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
    >
      {text || t("models_page.test_empty_response")}
    </pre>
  );
}

function ImageOutput({ payload }: { payload: ModelTestPayload }) {
  const { t } = useTranslation();
  // -1 keeps the overlay closed; the index is what lets it page between the
  // frames of an n>1 run instead of opening each one separately.
  const [previewIndex, setPreviewIndex] = useState(-1);
  const images = payload.images ?? [];

  if (images.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {t("models_page.test_no_image_returned")}
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="model-test-images">
      <div className="grid grid-cols-2 gap-2">
        {images.map((image, index) => (
          <ImageCard key={index} image={image} onPreview={() => setPreviewIndex(index)} />
        ))}
      </div>
      <ImagePreviewOverlay
        open={previewIndex >= 0}
        imageSrc={previewIndex >= 0 ? imageSource(images[previewIndex]) : null}
        imageAlt=""
        title={t("models_page.test_preview_image")}
        images={images.map((image, index) => ({
          src: imageSource(image),
          alt: "",
          downloadName: `model-test-${index + 1}.${image.format || "png"}`,
        }))}
        activeIndex={Math.max(previewIndex, 0)}
        onActiveIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(-1)}
      />
    </div>
  );
}

function ImageCard({ image, onPreview }: { image: ModelTestImage; onPreview: () => void }) {
  const { t } = useTranslation();
  const source = imageSource(image);
  const dimensions = image.width && image.height ? `${image.width}×${image.height}` : "";
  const meta = [dimensions, image.format?.toUpperCase(), formatBytes(image.bytes)]
    .filter(Boolean)
    .join(" · ");

  return (
    <figure className="overflow-hidden rounded-lg border border-slate-900/10 dark:border-white/10">
      <button
        type="button"
        onClick={onPreview}
        className="block w-full bg-slate-50 dark:bg-white/[0.04]"
        aria-label={t("models_page.test_preview_image")}
      >
        <img src={source} alt="" className="h-40 w-full object-contain" />
      </button>
      <figcaption className="space-y-1 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-2xs tabular-nums text-slate-500 dark:text-white/45">
            {meta}
          </span>
          <a
            href={source}
            download={`model-test.${image.format || "png"}`}
            className="shrink-0 text-slate-500 transition-colors hover:text-indigo-600 dark:text-white/45"
            aria-label={t("models_page.test_download_image")}
          >
            <Download size={12} aria-hidden />
          </a>
        </div>
        {image.c2pa?.present ? <ProvenanceLine image={image} /> : null}
        {image.revised_prompt ? (
          <p className="line-clamp-2 text-2xs text-slate-500 dark:text-white/45">
            {t("models_page.test_revised_prompt")}: {image.revised_prompt}
          </p>
        ) : null}
      </figcaption>
    </figure>
  );
}

/**
 * The generator the file itself claims, shown on the card rather than buried in
 * the metadata panel. This is the only place a gpt-image-2.5 request served by
 * 2.0 is visible, and an operator should not have to expand a panel to see it.
 */
function ProvenanceLine({ image }: { image: ModelTestImage }) {
  const { t } = useTranslation();
  const generator = [image.c2pa?.generator, image.c2pa?.generator_version]
    .filter(Boolean)
    .join(" ");
  if (!generator) return null;
  return (
    <p className="flex items-center gap-1 text-2xs text-slate-600 dark:text-white/60">
      <ShieldCheck size={11} className="shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <span className="truncate">
        {t("models_page.test_provenance_generator")}: {generator}
      </span>
    </p>
  );
}

function VideoOutput({ payload }: { payload: ModelTestPayload }) {
  const { t } = useTranslation();
  const url = payload.video?.url;
  if (!url) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        {t("models_page.test_no_video_returned")}
      </p>
    );
  }
  return (
    <div className="space-y-1" data-testid="model-test-video">
      <video
        src={url}
        controls
        playsInline
        className="w-full rounded-lg border border-slate-900/10 bg-black dark:border-white/10"
      />
      <div className="flex items-center justify-between gap-2 text-2xs text-slate-500 dark:text-white/45">
        <span className="tabular-nums">
          {payload.video?.duration
            ? t("models_page.test_clip_length", { seconds: payload.video.duration })
            : ""}
        </span>
        <a
          href={url}
          download
          className="transition-colors hover:text-indigo-600"
          aria-label={t("models_page.test_download_video")}
        >
          <Download size={12} aria-hidden />
        </a>
      </div>
    </div>
  );
}

/**
 * A mismatch banner shown above the result when the artifact's manifest names a
 * different model version than the one requested.
 */
export function ProvenanceWarning({ result }: { result: ModelTestResult }) {
  const { t } = useTranslation();
  const meta = result.metadata;
  if (!meta || meta.provenance_matches !== false) return null;
  const claimed = [meta.provenance_model, meta.provenance_version].filter(Boolean).join(" ");
  return (
    <p
      data-testid="model-test-provenance-warning"
      className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <ShieldAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {t("models_page.test_provenance_mismatch", {
          requested: meta.requested_model,
          claimed,
        })}
      </span>
    </p>
  );
}

function imageSource(image: ModelTestImage): string {
  if (image.url) return image.url;
  if (!image.b64_json) return "";
  return `data:image/${image.format || "png"};base64,${image.b64_json}`;
}
