import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { authFilesApi, imageGenerationApi } from "@/lib/http/apis";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
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

const readChannelLabel = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
};

const dedupeLabels = (files: AuthFileItem[]): string[] => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const file of files) {
    const label = readChannelLabel(file);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
};

const buildExampleRequest = (baseUrl: string) =>
  [
    `POST /v1/images/generations`,
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
  const [channels, setChannels] = useState<string[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [revisedPrompt, setRevisedPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadChannels = async () => {
      setChannelsLoading(true);
      try {
        const response = await authFilesApi.list();
        if (cancelled) return;
        const nextChannels = dedupeLabels((response.files ?? []).filter(isCodexOauthFile));
        setChannels(nextChannels);
      } catch {
        if (!cancelled) {
          setChannels([]);
        }
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
        }
      }
    };

    void loadChannels();

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
    "flex min-h-[280px] items-center justify-center overflow-hidden rounded-[24px] border border-dashed p-4 transition-colors duration-200",
    errorMessage
      ? "border-slate-200 bg-slate-100 text-slate-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-slate-200"
      : imageSrc
        ? "border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
        : "border-slate-200 bg-slate-50 text-slate-400 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-slate-500",
  ].join(" ");

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            {t("image_generation.title")}
          </h2>
          <p className="text-sm text-slate-600 dark:text-white/60">
            {t("image_generation.description")}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value={GPT_IMAGE_MODEL}>{GPT_IMAGE_MODEL}</TabsTrigger>
          </TabsList>

          <TabsContent value={GPT_IMAGE_MODEL} className="mt-4 space-y-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
              <Card
                title={t("image_generation.call_title")}
                description={t("image_generation.call_description")}
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

              <Card
                title={t("image_generation.channels_title")}
                description={t("image_generation.channels_description")}
                loading={channelsLoading}
              >
                {channels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {channels.map((channel) => (
                      <span
                        key={channel}
                        className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 dark:bg-white/8 dark:text-slate-200"
                      >
                        {channel}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-neutral-900 dark:text-white/45">
                    {t("image_generation.channels_empty")}
                  </div>
                )}
              </Card>
            </div>

            <Card
              title={t("image_generation.test_title")}
              description={t("image_generation.test_description")}
            >
              <div className="grid gap-4 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <div className="space-y-3">
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
                    rows={8}
                    className="w-full resize-y rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-300/40 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:border-neutral-700 dark:focus:ring-white/10"
                  />
                  <p className="text-xs text-slate-500 dark:text-white/45">
                    {t("image_generation.test_hint")}
                  </p>
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
                </div>

                <div className="space-y-3">
                  <div
                    data-testid="image-generation-preview"
                    className={previewClassName}
                    aria-live="polite"
                  >
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={t("image_generation.preview_alt", { model: GPT_IMAGE_MODEL })}
                        className="max-h-[440px] w-full rounded-[20px] object-contain"
                      />
                    ) : (
                      <div className="max-w-md text-center text-sm leading-6">
                        {errorMessage ||
                          (submitting
                            ? t("common.loading")
                            : t("image_generation.preview_placeholder"))}
                      </div>
                    )}
                  </div>

                  {revisedPrompt ? (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 dark:bg-neutral-900">
                      <p className="text-xs font-medium text-slate-500 dark:text-white/45">
                        {t("image_generation.revised_prompt_label")}
                      </p>
                      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                        {revisedPrompt}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
