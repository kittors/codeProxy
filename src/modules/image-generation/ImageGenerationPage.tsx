import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ArrowUp, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ImagePreviewOverlay } from "@/modules/ui/ImagePreviewOverlay";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import {
  VirtualTable,
  type VirtualTableColumn,
} from "@/modules/ui/VirtualTable";

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
const MAX_UPLOAD_IMAGES = 5;

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
type UploadedImage = { id: string; file: File; previewUrl: string };

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
  "curl http://127.0.0.1:8317/v1/images/generations \\",
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
  "curl http://127.0.0.1:8317/v1/images/edits \\",
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
        descriptionKey: "image_generation.param_images_desc",
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
    () =>
      ENDPOINT_DOCS.find((doc) => doc.mode === activeMode) ?? ENDPOINT_DOCS[0],
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
              data-testid={
                disabled ? "image-generation-disabled-state" : undefined
              }
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
                  <Tabs
                    value={activeMode}
                    onValueChange={(value) => setActiveMode(value as ImageMode)}
                  >
                    <TabsList>
                      {ENDPOINT_DOCS.map((doc) => (
                        <TabsTrigger key={doc.mode} value={doc.mode}>
                          {t(doc.titleKey)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {ENDPOINT_DOCS.map((doc) => (
                      <TabsContent
                        key={doc.mode}
                        value={doc.mode}
                        className="mt-4"
                      >
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
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(doc.titleKey)}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/55">
              {t(doc.descriptionKey)}
            </p>
          </div>
          <div className="flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-950">
            <span className="rounded-full bg-slate-900 px-2 py-0.5 font-semibold text-white dark:bg-white dark:text-neutral-950">
              {doc.method}
            </span>
            <span className="truncate text-slate-700 dark:text-white/75">
              {doc.path}
            </span>
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
        <SpecTable
          title={t("image_generation.request_params_title")}
          rows={doc.requestRows}
        />
        <SpecTable
          title={t("image_generation.response_schema_title")}
          rows={doc.responseRows}
        />
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
  const columns = useMemo<VirtualTableColumn<SpecRow>[]>(
    () => [
      {
        key: "name",
        label: t("image_generation.table_param"),
        width: "w-32",
        cellClassName: "font-mono text-xs text-slate-900 dark:text-white",
        render: (row) => row.name,
      },
      {
        key: "type",
        label: t("image_generation.table_type"),
        width: "w-28",
        cellClassName: "font-mono text-xs text-slate-600 dark:text-white/55",
        render: (row) => row.type,
      },
      {
        key: "required",
        label: t("image_generation.table_required"),
        width: "w-20",
        cellClassName: "text-xs text-slate-600 dark:text-white/55",
        render: (row) => (row.required ? t("common.yes") : t("common.no")),
      },
      {
        key: "description",
        label: t("image_generation.table_description"),
        cellClassName: "text-xs leading-5 text-slate-600 dark:text-white/60",
        render: (row) => t(row.descriptionKey),
      },
    ],
    [t],
  );

  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-neutral-800">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </h4>
      </div>
      <VirtualTable<SpecRow>
        rows={rows}
        columns={columns}
        rowKey={(row) => row.name}
        virtualize={false}
        height="h-auto"
        minHeight="min-h-0"
        minWidth="min-w-[560px]"
        caption={`${title} table`}
        rowHeight={48}
      />
    </div>
  );
}

function createUploadPreviewUrl(file: File): string {
  if (typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(file);
  }
  return `data:${file.type || "image/png"};base64,`;
}

function revokeUploadPreviewUrl(url: string) {
  if (
    url &&
    url.startsWith("blob:") &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(url);
  }
}

function ImageGenerationTestModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<(typeof SIZE_OPTIONS)[number]>("1024x1024");
  const [quality, setQuality] =
    useState<(typeof QUALITY_OPTIONS)[number]>("medium");
  const [count, setCount] = useState<(typeof COUNT_OPTIONS)[number]>(1);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusIndex, setStatusIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploadPreviewOpen, setUploadPreviewOpen] = useState(false);
  const [uploadPreviewIndex, setUploadPreviewIndex] = useState(0);
  const uploadedImagesRef = useRef<UploadedImage[]>([]);
  const resultSwipeRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setSize("1024x1024");
    setQuality("medium");
    setCount(1);
    setUploadedImages((current) => {
      current.forEach((item) => revokeUploadPreviewUrl(item.previewUrl));
      return [];
    });
    setSubmitting(false);
    setImages([]);
    setActiveImageIndex(0);
    setErrorMessage("");
    setStatusIndex(0);
    setPreviewOpen(false);
    setUploadPreviewOpen(false);
    setUploadPreviewIndex(0);
  }, [open]);

  useEffect(() => {
    uploadedImagesRef.current = uploadedImages;
  }, [uploadedImages]);

  useEffect(() => {
    return () => {
      uploadedImagesRef.current.forEach((item) =>
        revokeUploadPreviewUrl(item.previewUrl),
      );
    };
  }, []);

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
  const requestMode: ImageMode =
    uploadedImages.length > 0 ? "edits" : "generations";
  const canSend = Boolean(prompt.trim()) && !submitting;
  const hasMultipleResults = images.length > 1;
  const canShowPrevImage = activeImageIndex > 0;
  const canShowNextImage = activeImageIndex < images.length - 1;

  const showImageAt = (index: number) => {
    setActiveImageIndex(Math.min(Math.max(index, 0), Math.max(images.length - 1, 0)));
  };

  const handleResultPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    resultSwipeRef.current = { x: event.clientX, y: event.clientY };
  };

  const handleResultPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = resultSwipeRef.current;
    resultSwipeRef.current = null;
    if (!start || !hasMultipleResults) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }
    showImageAt(activeImageIndex + (deltaX < 0 ? 1 : -1));
  };

  const handleUploadImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadedImages((current) => {
      const remainingSlots = Math.max(0, MAX_UPLOAD_IMAGES - current.length);
      if (remainingSlots === 0) return current;
      const nextFiles = Array.from(files).slice(0, remainingSlots);
      return [
        ...current,
        ...nextFiles.map((file, index) => ({
          id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
          file,
          previewUrl: createUploadPreviewUrl(file),
        })),
      ];
    });
  };

  const removeUploadedImage = (id: string) => {
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

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || submitting) return;

    setSubmitting(true);
    setImages([]);
    setActiveImageIndex(0);
    setErrorMessage("");
    setPreviewOpen(false);

    try {
      const response =
        requestMode === "edits"
          ? await imageGenerationApi.test({
              mode: "edits",
              model: GPT_IMAGE_MODEL,
              prompt: trimmedPrompt,
              size,
              quality,
              n: count,
              images: uploadedImages.map((item) => item.file),
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
        error instanceof Error
          ? error.message
          : t("image_generation.test_failed_generic"),
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
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label={t("image_generation.size_label")}
              value={size}
              onChange={(value) =>
                setSize(value as (typeof SIZE_OPTIONS)[number])
              }
              options={SIZE_OPTIONS.map((value) => ({ value, label: value }))}
              className="min-w-[132px]"
              size="sm"
            />
            <Select
              aria-label={t("image_generation.quality_label")}
              value={quality}
              onChange={(value) =>
                setQuality(value as (typeof QUALITY_OPTIONS)[number])
              }
              options={QUALITY_OPTIONS.map((value) => ({
                value,
                label: value,
              }))}
              className="min-w-[108px]"
              size="sm"
            />
            <Select
              aria-label={t("image_generation.count_label")}
              value={String(count)}
              onChange={(value) =>
                setCount(Number(value) as (typeof COUNT_OPTIONS)[number])
              }
              options={COUNT_OPTIONS.map((value) => ({
                value: String(value),
                label: t("image_generation.count_option", { count: value }),
              }))}
              className="min-w-[96px]"
              size="sm"
            />
          </div>

          <div
            data-testid="image-generation-stage"
            data-state={
              submitting
                ? "generating"
                : activeImage
                  ? "ready"
                  : errorMessage
                    ? "error"
                    : "idle"
            }
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
                  className="relative z-10 h-full w-full overflow-hidden"
                  onPointerDown={handleResultPointerDown}
                  onPointerUp={handleResultPointerUp}
                >
                  <div
                    data-testid="image-generation-carousel-track"
                    className="flex h-full w-full transition-transform duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      transform: `translateX(${activeImageIndex === 0 ? 0 : -activeImageIndex * 100}%)`,
                    }}
                  >
                    {images.map((image, index) => (
                      <div
                        key={`generated-image-${index}`}
                        className="h-full w-full shrink-0"
                        aria-hidden={index !== activeImageIndex}
                      >
                        <div
                          data-testid={
                            index === activeImageIndex
                              ? "image-generation-result-scroll"
                              : undefined
                          }
                          className="h-full w-full overflow-auto"
                        >
                          <div className="min-h-full w-full p-3 sm:p-4">
                            <img
                              src={image.src}
                              alt={t("image_generation.preview_alt", {
                                model: GPT_IMAGE_MODEL,
                              })}
                              className="block h-auto w-full cursor-zoom-in select-none"
                              draggable={false}
                              onClick={() => setPreviewOpen(true)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {hasMultipleResults ? (
                  <>
                    <div
                      data-testid="image-generation-counter"
                      className="absolute top-3 right-3 z-20 rounded-full border border-white/45 bg-white/75 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/60 dark:text-white/80"
                    >
                      {activeImageIndex + 1}/{images.length}
                    </div>
                    <button
                      type="button"
                      onClick={() => showImageAt(activeImageIndex - 1)}
                      disabled={!canShowPrevImage}
                      aria-label={t("image_generation.prev_image")}
                      className="absolute top-1/2 left-3 z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/75 text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/10 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-neutral-900/85"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => showImageAt(activeImageIndex + 1)}
                      disabled={!canShowNextImage}
                      aria-label={t("image_generation.next_image")}
                      className="absolute top-1/2 right-3 z-20 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/75 text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 dark:border-white/10 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-neutral-900/85"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                ) : null}
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
                          requestMode === "edits"
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

          {activeImage?.revisedPrompt ? (
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">
              <p className="text-xs font-medium text-slate-500 dark:text-white/40">
                {t("image_generation.revised_prompt_label")}
              </p>
              <p className="mt-1 line-clamp-2 text-sm">
                {activeImage.revisedPrompt}
              </p>
            </div>
          ) : null}

          <div
            data-testid="image-generation-composer"
            className="relative shrink-0 rounded-[20px] border border-slate-200 bg-white px-2.5 pt-2.5 pb-11 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
            {uploadedImages.length > 0 ? (
              <div className="mb-2 flex max-h-32 flex-col gap-1.5 overflow-y-auto pr-0.5">
                {uploadedImages.map((item, index) => (
                  <div
                    key={item.id}
                    data-testid="image-generation-upload-chip"
                    className="group flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setUploadPreviewIndex(index);
                        setUploadPreviewOpen(true);
                      }}
                      className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-xs font-medium text-slate-700 transition-colors hover:text-slate-900 dark:text-white/75 dark:hover:text-white"
                      aria-label={t("image_generation.preview_upload_label", {
                        name: item.file.name,
                      })}
                    >
                      <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="h-full w-full object-cover"
                        />
                      </span>
                      <span className="truncate">{item.file.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeUploadedImage(item.id)}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full text-slate-400 opacity-100 transition hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 dark:text-white/35 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                      aria-label={t("image_generation.remove_upload_label", {
                        name: item.file.name,
                      })}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <label htmlFor="image-generation-prompt" className="sr-only">
              {t("image_generation.prompt_label")}
            </label>
            <input
              id="image-generation-reference"
              aria-label={t("image_generation.upload_images_label")}
              type="file"
              accept="image/*"
              multiple
              disabled={uploadedImages.length >= MAX_UPLOAD_IMAGES}
              className="sr-only"
              onChange={(event) => {
                handleUploadImages(event.target.files);
                event.currentTarget.value = "";
              }}
            />
            <textarea
              id="image-generation-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={t("image_generation.prompt_placeholder")}
              rows={4}
              className="min-h-[112px] w-full resize-none border-0 bg-transparent px-1 py-0 pr-8 pb-10 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
            />
            <label
              htmlFor="image-generation-reference"
              data-testid="image-generation-upload-trigger"
              className={[
                "absolute bottom-2 left-2 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors",
                uploadedImages.length >= MAX_UPLOAD_IMAGES
                  ? "cursor-not-allowed opacity-40"
                  : "hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white",
              ].join(" ")}
              title={t("image_generation.upload_images_label")}
            >
              <Plus size={14} />
            </label>
            <button
              type="submit"
              disabled={!canSend}
              aria-busy={submitting}
              aria-label={t("image_generation.send_button")}
              data-testid="image-generation-send-button"
              className="absolute right-2 bottom-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition active:translate-y-px disabled:pointer-events-none disabled:opacity-40 dark:bg-white dark:text-neutral-950"
            >
              <ArrowUp size={14} />
            </button>
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
      <ImagePreviewOverlay
        open={uploadPreviewOpen && uploadedImages.length > 0}
        imageSrc={uploadedImages[uploadPreviewIndex]?.previewUrl ?? null}
        imageAlt={
          uploadedImages[uploadPreviewIndex]?.file.name ??
          t("image_generation.upload_images_label")
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
