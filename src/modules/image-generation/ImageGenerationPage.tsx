import { useCallback, useEffect, useMemo, useState } from "react";
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
              <Card title={t("image_generation.call_title")}>
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

              <Card title={t("image_generation.test_title")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600 dark:text-white/60">
                    {t("image_generation.test_hint")}
                  </p>
                  <Button
                    variant="primary"
                    onClick={openTest}
                    disabled={channelsLoading || disabled}
                    aria-busy={channelsLoading}
                  >
                    {t("image_generation.open_test_button")}
                  </Button>
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

  useEffect(() => {
    if (!open) return;
    setPrompt("");
    setSubmitting(false);
    setImageSrc(null);
    setRevisedPrompt("");
    setErrorMessage("");
  }, [open]);

  const handleGenerate = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || submitting) return;

    setSubmitting(true);
    setImageSrc(null);
    setRevisedPrompt("");
    setErrorMessage("");

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

  const previewClassName = [
    "flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[24px] border border-dashed p-4 transition-colors duration-200",
    errorMessage
      ? "border-slate-200 bg-slate-100 text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200"
      : imageSrc
        ? "border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        : "border-slate-200 bg-slate-50 text-slate-400 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-slate-500",
  ].join(" ");

  return (
    <Modal
      open={open}
      title={t("image_generation.test_title")}
      onClose={onClose}
      maxWidth="max-w-none"
      panelClassName="h-[78vh] w-[92vw] max-w-[1080px]"
      bodyHeightClassName="h-[calc(78vh-9rem)]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!prompt.trim() || submitting}
            aria-busy={submitting}
          >
            {submitting
              ? t("image_generation.generating_button")
              : t("image_generation.generate_button")}
          </Button>
        </>
      }
    >
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className="min-h-0 space-y-3">
          <label
            htmlFor="image-generation-prompt"
            className="block text-sm font-medium text-slate-700 dark:text-white/80"
          >
            {t("image_generation.prompt_label")}
          </label>
          <textarea
            id="image-generation-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t("image_generation.prompt_placeholder")}
            className="h-[calc(100%-2rem)] min-h-40 w-full resize-none rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:border-neutral-700 dark:focus:ring-white/10"
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <div data-testid="image-generation-preview" className={previewClassName} aria-live="polite">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
                className="h-full w-full rounded-[20px] object-contain"
              />
            ) : (
              <div className="max-w-md text-center text-sm leading-6">
                {errorMessage ||
                  (submitting ? t("common.loading") : t("image_generation.preview_placeholder"))}
              </div>
            )}
          </div>

          {revisedPrompt ? (
            <div className="shrink-0 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-neutral-900">
              <p className="text-xs font-medium text-slate-500 dark:text-white/45">
                {t("image_generation.revised_prompt_label")}
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{revisedPrompt}</p>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
