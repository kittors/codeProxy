import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { Modal } from "@/modules/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";

const GPT_IMAGE_MODEL = "gpt-image-2";

const isCodexOauthFile = (file: AuthFileItem): boolean => {
  const accountType = String(file.account_type ?? "")
    .trim()
    .toLowerCase();
  const provider = String(file.type ?? file.provider ?? "")
    .trim()
    .toLowerCase();
  return accountType === "oauth" && provider === "codex";
};

const buildExampleRequest = (baseUrl: string) =>
  [
    "POST /v1/images/generations",
    `Host: ${baseUrl.replace(/^https?:\/\//, "")}`,
    "Authorization: Bearer YOUR_API_KEY",
    "Content-Type: application/json",
    "",
    "{",
    '  "model": "gpt-image-2",',
    '  "prompt": "A studio-quality product photo of a ceramic mug on a wooden table",',
    '  "response_format": "b64_json"',
    "}",
  ].join("\n");

export function ImageGenerationPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(GPT_IMAGE_MODEL);
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

  const exampleBaseUrl = useMemo(() => {
    if (typeof window === "undefined" || !window.location?.origin) {
      return "https://your-domain.example/v1";
    }
    return `${window.location.origin}/v1`;
  }, []);

  const requestExample = useMemo(() => buildExampleRequest(exampleBaseUrl), [exampleBaseUrl]);
  const disabled = !channelsLoading && !hasCodexOauthChannel;

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
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-neutral-900 dark:text-slate-200">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {t("image_generation.base_url_label")}
                    </p>
                    <p className="mt-1 break-all font-mono text-[13px]">{exampleBaseUrl}</p>
                  </div>
                  <pre className="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-3 text-[13px] leading-6 text-slate-100">
                    <code>{requestExample}</code>
                  </pre>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <ImageGenerationTestModal open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}

function ImageGenerationTestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setSubmitting(false);
    setImageSrc(null);
    setRevisedPrompt("");
    setErrorMessage("");
    setPreviewOpen(false);
  }, [open]);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || submitting) return;

    setSubmitting(true);
    setImageSrc(null);
    setRevisedPrompt("");
    setErrorMessage("");
    setPreviewOpen(false);

    try {
      const response = await imageGenerationApi.test({
        model: GPT_IMAGE_MODEL,
        prompt: trimmedPrompt,
      });
      const item = response.data?.[0];
      if (!item?.b64_json) {
        throw new Error(t("image_generation.test_empty_result"));
      }
      setImageSrc(`data:image/png;base64,${item.b64_json}`);
      setRevisedPrompt(item.revised_prompt?.trim() ?? "");
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
      : imageSrc
        ? "border-slate-200 bg-slate-100 dark:border-neutral-800 dark:bg-black"
        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/55",
  ].join(" ");
  const statusText = t("image_generation.generation_status_generating");
  const showGeneratingState = submitting && !imageSrc && !errorMessage;
  const showIdleCanvas = !submitting && !imageSrc && !errorMessage;

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
          <div
            data-testid="image-generation-stage"
            data-state={submitting ? "generating" : imageSrc ? "ready" : errorMessage ? "error" : "idle"}
            className={stageClassName}
            aria-live="polite"
          >
            {showGeneratingState ? (
              <>
                <div className="image-generation-dots-layer" />
                <div className="image-generation-flow-layer" />
              </>
            ) : null}
            {imageSrc ? (
              <>
                <div
                  data-testid="image-generation-result-scroll"
                  className="relative z-10 h-full w-full overflow-auto"
                >
                  <div className="inline-flex min-h-full min-w-full items-center justify-center p-3 sm:p-4">
                    <img
                      src={imageSrc}
                      alt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
                      className="block h-auto w-auto max-w-none cursor-zoom-in"
                      onClick={() => setPreviewOpen(true)}
                    />
                  </div>
                </div>
                <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur">
                  {t("image_generation.open_preview")}
                </span>
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
                        {t("image_generation.idle_hint")}
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

          {revisedPrompt ? (
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200">
              <p className="text-xs font-medium text-slate-500 dark:text-white/40">
                {t("image_generation.revised_prompt_label")}
              </p>
              <p className="mt-1 line-clamp-2 text-sm">{revisedPrompt}</p>
            </div>
          ) : null}

          <div
            data-testid="image-generation-composer"
            className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
          >
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
                disabled={!prompt.trim() || submitting}
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
        open={previewOpen && Boolean(imageSrc)}
        imageSrc={imageSrc}
        imageAlt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
        title={t("image_generation.image_preview_title")}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}

function ImagePreviewOverlay({
  open,
  imageSrc,
  imageAlt,
  title,
  onClose,
}: {
  open: boolean;
  imageSrc: string | null;
  imageAlt: string;
  title: string;
  onClose: () => void;
}) {
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

  if (!open || !imageSrc) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-variant="image-only"
      className="fixed inset-0 z-[220] bg-slate-950/88 backdrop-blur-sm"
    >
      <div className="absolute top-4 right-4 z-20 sm:top-5 sm:right-5">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white/80 backdrop-blur transition-colors hover:bg-black/55 hover:text-white"
          aria-label="close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="h-full w-full overflow-auto overscroll-contain" onClick={onClose}>
        <div className="inline-flex min-h-full min-w-full items-center justify-center p-6 sm:p-10">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="block h-auto w-auto max-w-none select-none"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
