import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ImagePreviewOverlay } from "@/modules/ui/ImagePreviewOverlay";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";

const GPT_IMAGE_MODEL = "gpt-image-2";
const GENERATION_STATUS_KEYS = [
  "image_generation.generation_status_drafting",
  "image_generation.generation_status_creating",
  "image_generation.generation_status_refining",
  "image_generation.generation_status_starting",
] as const;
const GENERATION_STATUS_INTERVAL_MS = 1800;
const SIZE_OPTIONS = ["1024x1024", "1792x1024", "1024x1792"] as const;
const QUALITY_OPTIONS = ["low", "medium", "high"] as const;
const COUNT_OPTIONS = [1, 2, 3, 4] as const;

type ImageMode = "generations" | "edits";
type SpecRow = {
  name: string;
  type: string;
  required: boolean;
  descriptionKey: string;
};
type EndpointDoc = {
  mode: ImageMode;
  titleKey: string;
  descriptionKey: string;
  method: "POST";
  path: string;
  contentType: string;
  requestRows: SpecRow[];
  responseRows: SpecRow[];
  curl: string;
};
type GeneratedImage = { src: string; revisedPrompt?: string };

const isCodexOauthFile = (file: AuthFileItem): boolean => {
  const accountType = String(file.account_type ?? "")
    .trim()
    .toLowerCase();
  const provider = String(file.type ?? file.provider ?? "")
    .trim()
    .toLowerCase();
  return accountType === "oauth" && provider === "codex";
};

const textToImageCurl = [
  'curl http://127.0.0.1:8317/v1/images/generations \\',
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  "  -d '{",
  '    "model": "gpt-image-2",',
  '    "prompt": "你的中文描述",',
  '    "size": "1024x1024",',
  '    "quality": "high",',
  '    "n": 1',
  "  }'",
].join("\n");

const imageToImageCurl = [
  'curl http://127.0.0.1:8317/v1/images/edits \\',
  '  -H "Authorization: Bearer $API_KEY" \\',
  '  -F "model=gpt-image-2" \\',
  '  -F "prompt=把这张图改成蓝色图标风格" \\',
  '  -F "size=1024x1024" \\',
  '  -F "quality=high" \\',
  '  -F "n=1" \\',
  '  -F "image=@/path/to/image.png"',
].join("\n");

const RESPONSE_ROWS: SpecRow[] = [
  {
    name: "created",
    type: "number",
    required: false,
    descriptionKey: "image_generation.response_created_desc",
  },
  {
    name: "data[].b64_json",
    type: "string",
    required: true,
    descriptionKey: "image_generation.response_b64_desc",
  },
  {
    name: "data[].revised_prompt",
    type: "string",
    required: false,
    descriptionKey: "image_generation.response_revised_prompt_desc",
  },
];

const ENDPOINT_DOCS: EndpointDoc[] = [
  {
    mode: "generations",
    titleKey: "image_generation.text_to_image_title",
    descriptionKey: "image_generation.text_to_image_desc",
    method: "POST",
    path: "/v1/images/generations",
    contentType: "application/json",
    requestRows: [
      {
        name: "model",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_model_desc",
      },
      {
        name: "prompt",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_prompt_desc",
      },
      {
        name: "size",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_size_desc",
      },
      {
        name: "quality",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_quality_desc",
      },
      {
        name: "n",
        type: "number",
        required: false,
        descriptionKey: "image_generation.param_n_desc",
      },
    ],
    responseRows: RESPONSE_ROWS,
    curl: textToImageCurl,
  },
  {
    mode: "edits",
    titleKey: "image_generation.image_to_image_title",
    descriptionKey: "image_generation.image_to_image_desc",
    method: "POST",
    path: "/v1/images/edits",
    contentType: "multipart/form-data",
    requestRows: [
      {
        name: "model",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_model_desc",
      },
      {
        name: "prompt",
        type: "string",
        required: true,
        descriptionKey: "image_generation.param_edit_prompt_desc",
      },
      {
        name: "image",
        type: "file",
        required: true,
        descriptionKey: "image_generation.param_image_desc",
      },
      {
        name: "size",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_size_desc",
      },
      {
        name: "quality",
        type: "string",
        required: false,
        descriptionKey: "image_generation.param_quality_desc",
      },
      {
        name: "n",
        type: "number",
        required: false,
        descriptionKey: "image_generation.param_n_desc",
      },
    ],
    responseRows: RESPONSE_ROWS,
    curl: imageToImageCurl,
  },
];

export function ImageGenerationPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(GPT_IMAGE_MODEL);
  const [activeMode, setActiveMode] = useState<ImageMode>("generations");
  const [hasCodexOauthChannel, setHasCodexOauthChannel] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadAvailability = async () => {
      setChannelsLoading(true);
      try {
        const response = await authFilesApi.list();
        if (cancelled) return;
        setHasCodexOauthChannel((response.files ?? []).some(isCodexOauthFile));
      } catch {
        if (!cancelled) {
          setHasCodexOauthChannel(false);
        }
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
        }
      }
    };

    void loadAvailability();

    return () => {
      cancelled = true;
    };
  }, []);

  const disabled = !channelsLoading && !hasCodexOauthChannel;
  const activeDoc = useMemo(
    () => ENDPOINT_DOCS.find((doc) => doc.mode === activeMode) ?? ENDPOINT_DOCS[0],
    [activeMode],
  );

  const openTest = useCallback(() => {
    if (disabled || channelsLoading) return;
    setTestOpen(true);
  }, [channelsLoading, disabled]);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
          {t("image_generation.title")}
        </h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value={GPT_IMAGE_MODEL}>{GPT_IMAGE_MODEL}</TabsTrigger>
          </TabsList>

          <TabsContent value={GPT_IMAGE_MODEL} className="mt-4 space-y-4">
            {disabled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                {t("image_generation.channels_empty")}
              </div>
            ) : null}

            <div
              data-testid={disabled ? "image-generation-disabled-state" : undefined}
              className={disabled ? "space-y-4 opacity-60" : "space-y-4"}
              aria-disabled={disabled}
            >
              <Card
                title={t("image_generation.call_title")}
                description={t("image_generation.call_description")}
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={openTest}
                    disabled={channelsLoading || disabled}
                    aria-busy={channelsLoading}
                  >
                    {t("image_generation.open_test_button")}
                  </Button>
                }
              >
                <div className="space-y-4">
                  <Tabs value={activeMode} onValueChange={(value) => setActiveMode(value as ImageMode)}>
                    <TabsList>
                      {ENDPOINT_DOCS.map((doc) => (
                        <TabsTrigger key={doc.mode} value={doc.mode}>
                          {t(doc.titleKey)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {ENDPOINT_DOCS.map((doc) => (
                      <TabsContent key={doc.mode} value={doc.mode} className="mt-4">
                        <EndpointDocView doc={doc} />
                      </TabsContent>
                    ))}
                  </Tabs>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/55">
                    {t("image_generation.active_endpoint_hint", {
                      method: activeDoc.method,
                      path: activeDoc.path,
                    })}
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <ImageGenerationTestModal
        open={testOpen}
        initialMode={activeMode}
        onClose={() => setTestOpen(false)}
      />
    </div>
  );
}

function EndpointDocView({ doc }: { doc: EndpointDoc }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t(doc.titleKey)}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/55">
              {t(doc.descriptionKey)}
            </p>
          </div>
          <div className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
            <span className="rounded-full bg-slate-900 px-2 py-0.5 font-semibold text-white dark:bg-white dark:text-neutral-950">
              {doc.method}
            </span>
            <span className="truncate text-slate-700 dark:text-white/75">{doc.path}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-white/55">
          <span className="rounded-full bg-white px-2.5 py-1 dark:bg-neutral-950">
            Authorization: Bearer YOUR_API_KEY
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 dark:bg-neutral-950">
            {doc.contentType}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SpecTable title={t("image_generation.request_params_title")} rows={doc.requestRows} />
        <SpecTable title={t("image_generation.response_schema_title")} rows={doc.responseRows} />
      </div>

      <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950 dark:border-neutral-800">
        <div className="border-b border-white/10 px-4 py-2 text-xs font-medium text-slate-300">
          curl
        </div>
        <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-6 text-slate-100">
          <code>{doc.curl}</code>
        </pre>
      </div>
    </div>
  );
}

function SpecTable({ title, rows }: { title: string; rows: SpecRow[] }) {
  const { t } = useTranslation();

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:bg-neutral-900 dark:text-white/40">
            <tr>
              <th className="px-4 py-3">{t("image_generation.table_param")}</th>
              <th className="px-4 py-3">{t("image_generation.table_type")}</th>
              <th className="px-4 py-3">{t("image_generation.table_required")}</th>
              <th className="px-4 py-3">{t("image_generation.table_description")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-neutral-800">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-white">
                  {row.name}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-white/55">
                  {row.type}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600 dark:text-white/55">
                  {row.required ? t("common.yes") : t("common.no")}
                </td>
                <td className="px-4 py-3 text-xs leading-5 text-slate-600 dark:text-white/60">
                  {t(row.descriptionKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImageGenerationTestModal({
  open,
  initialMode,
  onClose,
}: {
  open: boolean;
  initialMode: ImageMode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ImageMode>(initialMode);
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<(typeof SIZE_OPTIONS)[number]>("1024x1024");
  const [quality, setQuality] = useState<(typeof QUALITY_OPTIONS)[number]>("medium");
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(1);
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPrompt("");
    setSize("1024x1024");
    setQuality("medium");
    setCount(1);
    setReferenceImage(null);
    setSubmitting(false);
    setImages([]);
    setActiveImageIndex(0);
    setErrorMessage("");
    setStatusIndex(0);
    setPreviewOpen(false);
  }, [initialMode, open]);

  useEffect(() => {
    if (!submitting) return;

    setStatusIndex(0);
    const id = window.setInterval(() => {
      setStatusIndex((current) => {
        if (current >= GENERATION_STATUS_KEYS.length - 1) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, GENERATION_STATUS_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [submitting]);

  const activeImage = images[activeImageIndex] ?? null;

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || submitting) return;
    if (mode === "edits" && !referenceImage) return;

    setSubmitting(true);
    setImages([]);
    setActiveImageIndex(0);
    setErrorMessage("");
    setPreviewOpen(false);

    try {
      const response =
        mode === "edits" && referenceImage
          ? await imageGenerationApi.test({
              mode: "edits",
              model: GPT_IMAGE_MODEL,
              prompt: trimmedPrompt,
              size,
              quality,
              n: count,
              image: referenceImage,
            })
          : await imageGenerationApi.test({
              mode: "generations",
              model: GPT_IMAGE_MODEL,
              prompt: trimmedPrompt,
              size,
              quality,
              n: count,
            });

      const nextImages = (response.data ?? [])
        .map<GeneratedImage | null>((item) => {
          const b64Json = item.b64_json?.trim() ?? "";
          if (!b64Json) return null;
          return {
            src: `data:image/png;base64,${b64Json}`,
            revisedPrompt: item.revised_prompt?.trim() || undefined,
          };
        })
        .filter((item): item is GeneratedImage => item !== null);

      if (nextImages.length === 0) {
        throw new Error(t("image_generation.test_empty_result"));
      }

      setImages(nextImages);
      setActiveImageIndex(0);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("image_generation.test_failed_generic"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const stageClassName = [
    "relative h-[clamp(240px,42vh,400px)] overflow-hidden rounded-2xl border transition-colors duration-200 sm:h-[clamp(280px,44vh,440px)]",
    errorMessage
      ? "border-slate-200 bg-slate-100 text-slate-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/85"
      : activeImage
        ? "border-slate-200 bg-slate-100 dark:border-neutral-800 dark:bg-black"
        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/55",
  ].join(" ");
  const statusText = t(GENERATION_STATUS_KEYS[statusIndex]);
  const showGeneratingState = submitting && !activeImage && !errorMessage;
  const showIdleCanvas = !submitting && !activeImage && !errorMessage;

  return (
    <>
      <Modal
        open={open}
        title={t("image_generation.test_title")}
        onClose={onClose}
        maxWidth="max-w-[640px]"
        panelClassName="w-full border-slate-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950"
        bodyHeightClassName="max-h-[calc(100vh-10rem)]"
        bodyClassName="!overflow-y-auto !px-4 !py-4 sm:!px-5"
      >
        <form
          className="flex min-h-0 flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerate();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={mode} onValueChange={(value) => setMode(value as ImageMode)}>
              <TabsList>
                <TabsTrigger value="generations">{t("image_generation.text_to_image_title")}</TabsTrigger>
                <TabsTrigger value="edits">{t("image_generation.image_to_image_title")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap gap-2">
              <Select
                aria-label={t("image_generation.size_label")}
                value={size}
                onChange={(value) => setSize(value as (typeof SIZE_OPTIONS)[number])}
                options={SIZE_OPTIONS.map((value) => ({ value, label: value }))}
                className="min-w-[132px]"
                size="sm"
              />
              <Select
                aria-label={t("image_generation.quality_label")}
                value={quality}
                onChange={(value) => setQuality(value as (typeof QUALITY_OPTIONS)[number])}
                options={QUALITY_OPTIONS.map((value) => ({ value, label: value }))}
                className="min-w-[108px]"
                size="sm"
              />
              <Select
                aria-label={t("image_generation.count_label")}
                value={String(count)}
                onChange={(value) => setCount(Number(value) as (typeof COUNT_OPTIONS)[number])}
                options={COUNT_OPTIONS.map((value) => ({
                  value: String(value),
                  label: t("image_generation.count_option", { count: value }),
                }))}
                className="min-w-[96px]"
                size="sm"
              />
            </div>
          </div>

          <div
            data-testid="image-generation-stage"
            data-state={submitting ? "generating" : activeImage ? "ready" : errorMessage ? "error" : "idle"}
            className={stageClassName}
            aria-live="polite"
          >
            {showGeneratingState ? (
              <>
                <div className="image-generation-dots-layer" />
                <div className="image-generation-flow-layer" />
              </>
            ) : null}
            {activeImage ? (
              <>
                <div
                  data-testid="image-generation-result-scroll"
                  className="relative z-10 h-full w-full overflow-auto"
                >
                  <div className="min-h-full w-full p-3 sm:p-4">
                    <img
                      src={activeImage.src}
                      alt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
                      className="block h-auto w-full cursor-zoom-in"
                      onClick={() => setPreviewOpen(true)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="absolute right-3 bottom-3 z-20 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
                >
                  {t("image_generation.open_preview")}
                </button>
              </>
            ) : (
              <div
                data-testid="image-generation-preview"
                className={[
                  "relative flex h-full w-full overflow-hidden px-6 py-6 sm:px-8 sm:py-8",
                  errorMessage
                    ? "bg-slate-100 text-slate-700 dark:bg-neutral-900 dark:text-white"
                    : "bg-transparent",
                ].join(" ")}
              >
                <div className="relative z-10 flex h-full w-full items-start">
                  {showGeneratingState ? (
                    <div className="max-w-md">
                      <p className="text-3xl font-semibold tracking-tight text-slate-700 dark:text-white/92 sm:text-[38px]">
                        {statusText}
                      </p>
                      <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
                        {t("image_generation.generating_subtitle")}
                      </p>
                    </div>
                  ) : null}

                  {showIdleCanvas ? (
                    <div className="max-w-md">
                      <p className="text-lg font-medium text-slate-600 dark:text-white/72">
                        {t(
                          mode === "edits"
                            ? "image_generation.idle_hint_edits"
                            : "image_generation.idle_hint",
                        )}
                      </p>
                    </div>
                  ) : null}

                  {errorMessage ? (
                    <div className="max-w-md">
                      <p className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-white">
                        {errorMessage}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {images.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {images.map((_, index) => (
                <button
                  key={`image-item-${index}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    activeImageIndex === index
                      ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/70",
                  ].join(" ")}
                  aria-label={t("image_generation.image_index_label", { index: index + 1 })}
                >
                  {t("image_generation.image_index_label", { index: index + 1 })}
                </button>
              ))}
            </div>
          ) : null}

          {activeImage?.revisedPrompt ? (
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">
              <p className="text-xs font-medium text-slate-500 dark:text-white/40">
                {t("image_generation.revised_prompt_label")}
              </p>
              <p className="mt-1 line-clamp-2 text-sm">{activeImage.revisedPrompt}</p>
            </div>
          ) : null}

          <div
            data-testid="image-generation-composer"
            className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            {mode === "edits" ? (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label
                  htmlFor="image-generation-reference"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/75 dark:hover:bg-neutral-800"
                >
                  <ImagePlus size={14} />
                  <span>{referenceImage ? referenceImage.name : t("image_generation.upload_label")}</span>
                </label>
                <input
                  id="image-generation-reference"
                  aria-label={t("image_generation.reference_image_label")}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => setReferenceImage(event.target.files?.[0] ?? null)}
                />
                {referenceImage ? (
                  <span className="text-xs text-slate-500 dark:text-white/45">
                    {t("image_generation.reference_ready")}
                  </span>
                ) : null}
              </div>
            ) : null}
            <label htmlFor="image-generation-prompt" className="sr-only">
              {t("image_generation.prompt_label")}
            </label>
            <div className="flex items-end gap-3">
              <textarea
                id="image-generation-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t("image_generation.prompt_placeholder")}
                rows={3}
                className="min-h-[88px] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!prompt.trim() || submitting || (mode === "edits" && !referenceImage)}
                aria-busy={submitting}
                className="h-10 shrink-0 rounded-xl px-4"
              >
                {submitting
                  ? t("image_generation.generating_button")
                  : t("image_generation.generate_button")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ImagePreviewOverlay
        open={previewOpen && Boolean(activeImage)}
        imageSrc={activeImage?.src ?? null}
        imageAlt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
        title={t("image_generation.image_preview_title")}
        downloadName={`${GPT_IMAGE_MODEL}-${activeImageIndex + 1}.png`}
        images={images.map((image, index) => ({
          src: image.src,
          alt: t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL }),
          downloadName: `${GPT_IMAGE_MODEL}-${index + 1}.png`,
        }))}
        activeIndex={activeImageIndex}
        onActiveIndexChange={setActiveImageIndex}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
