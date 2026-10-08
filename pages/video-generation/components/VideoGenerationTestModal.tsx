import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  videoGenerationApi,
  type VideoGenerationModel,
  type VideoGenerationTestResponse,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  FormField,
  Modal,
  rules,
  SegmentedControl,
  Select,
  Textarea,
  TextInput,
  useFormValidation,
  type Rule,
} from "@code-proxy/ui";
import { VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, type VideoEndpointDoc } from "./apiDocs";

const FORM_ID = "video-generation-test-form";
const TASK_POLL_INTERVAL_MS = 2000;
const DEFAULT_DURATION = "6";

type VideoMode = VideoEndpointDoc["mode"];

type TestState = {
  running: boolean;
  phase: string;
  result: VideoGenerationTestResponse | null;
  error: string | null;
};

const emptyTestState: TestState = { running: false, phase: "", result: null, error: null };

/** 源图：网址，或服务端同样接受的 data URI（rules.url 不认没有主机名的 data:）。 */
const IMAGE_SOURCE: Rule<string> = (value) =>
  /^data:image\//i.test(value.trim()) ? null : rules.url()(value);

/**
 * 测试视频生成。
 *
 * 先选「文生视频 / 图生视频」（与页面上的文档页签联动），再选模型、写提示词；图生视频才出现源图地址。
 * 提示词、源图、时长都就地校验，回车或 ⌘/Ctrl + Enter 提交。生成是异步的：提交后按任务 ID 轮询，
 * 关闭弹窗不会中断，重新打开还能看到进度和结果。
 */
export function VideoGenerationTestModal({
  open,
  models,
  mode,
  onModeChange,
  onClose,
}: {
  open: boolean;
  models: VideoGenerationModel[];
  mode: VideoMode;
  onModeChange: (mode: VideoMode) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const pollTimer = useRef<number | null>(null);
  const [test, setTest] = useState<TestState>(emptyTestState);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [aspectRatio, setAspectRatio] = useState(VIDEO_ASPECT_RATIOS[0]);
  const [resolution, setResolution] = useState(VIDEO_RESOLUTIONS[1]);

  useEffect(
    () => () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  // 目录到达前没有可选模型；到达后默认第一个，用户选过的不覆盖。
  const activeModel = model || models[0]?.id || "";
  const selectedModel = useMemo(
    () => models.find((entry) => entry.id === activeModel),
    [activeModel, models],
  );
  const maxDuration = selectedModel?.max_duration_seconds || 15;
  // A model the tenant has no credential for cannot be generated with. Saying so
  // here — instead of letting the request fail with "auth_not_found" — is the
  // difference between an actionable message and a dead end. `available` is
  // undefined on an older server, which must not disable a working page.
  const canGenerate = models.length > 0 && selectedModel?.available !== false;
  const imageMode = mode === "image";

  const validation = useFormValidation(
    { prompt, imageUrl, duration },
    {
      prompt: [rules.required()],
      // 文生视频不发送源图，所以只在图生视频时校验。
      imageUrl: imageMode ? [rules.required(), IMAGE_SOURCE] : [],
      duration: [rules.required(), rules.integer({ min: 1, max: maxDuration })],
    },
  );
  const { reset } = validation;
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const pollTask = useCallback(
    (taskId: string) => {
      void videoGenerationApi
        .getTestTask(taskId)
        .then((task) => {
          if (task.status === "succeeded") {
            setTest({ running: false, phase: "", result: task.result ?? null, error: null });
            return;
          }
          if (task.status === "failed") {
            const message =
              task.error?.body?.error?.message ?? t("video_generation.test_failed_generic");
            setTest({ running: false, phase: "", result: null, error: message });
            return;
          }
          setTest((current) => ({ ...current, phase: task.phase ?? task.status }));
          pollTimer.current = window.setTimeout(() => pollTask(taskId), TASK_POLL_INTERVAL_MS);
        })
        .catch((error: unknown) => {
          setTest({
            running: false,
            phase: "",
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [t],
  );

  const submit = () => {
    if (test.running || !canGenerate || !activeModel) return;
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    setTest({ running: true, phase: "queued", result: null, error: null });
    void videoGenerationApi
      .startTestTask({
        model: activeModel,
        prompt,
        duration: Number(duration.trim()),
        aspect_ratio: aspectRatio,
        resolution,
        ...(imageMode && imageUrl.trim() ? { image: imageUrl.trim() } : {}),
      })
      .then((task) => pollTask(task.task_id))
      .catch((error: unknown) => {
        setTest({
          running: false,
          phase: "",
          result: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  };

  const modelOptions = useMemo(
    () =>
      models.map((entry) => {
        const base = entry.display_name ? `${entry.display_name} · ${entry.id}` : entry.id;
        return {
          value: entry.id,
          label:
            entry.available === false
              ? `${base} (${t("video_generation.unavailable_suffix")})`
              : base,
        };
      }),
    [models, t],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("video_generation.test_title")}
      description={t("video_generation.test_modal_desc")}
      icon={<Clapperboard />}
      size="lg"
      onSubmitShortcut={submit}
      footerStart={t("video_generation.test_shortcut")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            loading={test.running}
            disabled={!canGenerate}
          >
            {test.running ? t("video_generation.test_running") : t("video_generation.test_submit")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {models.length > 0 && !canGenerate ? (
          <Callout tone="warning">{t("video_generation.no_channel_hint")}</Callout>
        ) : null}

        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)]">
          <div className="flex flex-col gap-2.5">
            <span className="text-sm font-medium text-ink">{t("video_generation.field_mode")}</span>
            <SegmentedControl
              ariaLabel={t("video_generation.field_mode")}
              value={mode}
              onChange={onModeChange}
              options={[
                { value: "text", label: t("video_generation.text_to_video_title") },
                { value: "image", label: t("video_generation.image_to_video_title") },
              ]}
              className="self-start"
            />
          </div>
          <FormField label={t("video_generation.field_model")} reserveMeta={false}>
            <Select value={activeModel} onChange={setModel} options={modelOptions} />
          </FormField>
        </div>

        <FormField
          label={t("video_generation.field_prompt")}
          required
          description={imageMode ? t("video_generation.param_image_prompt_desc") : undefined}
          error={validation.error("prompt")}
        >
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            {...validation.bind("prompt")}
            rows={3}
            className="min-h-24"
            placeholder={t("video_generation.field_prompt_placeholder")}
          />
        </FormField>

        {imageMode ? (
          <FormField
            label={t("video_generation.field_image_url")}
            required
            description={t("video_generation.field_image_url_hint")}
            error={validation.error("imageUrl")}
          >
            <TextInput
              // TextInput 没有 aria-label 时会拿 placeholder 当名称，盖掉可见标签；这里显式写回标签。
              aria-label={t("video_generation.field_image_url")}
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              {...validation.bind("imageUrl")}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://example.com/still.png"
            />
          </FormField>
        ) : null}

        <div className="grid gap-x-4 sm:grid-cols-3">
          <FormField
            label={t("video_generation.field_duration", { max: maxDuration })}
            error={validation.error("duration")}
          >
            <TextInput
              type="number"
              inputMode="numeric"
              min={1}
              max={maxDuration}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              {...validation.bind("duration")}
              className="tabular-nums"
            />
          </FormField>
          <FormField label={t("video_generation.field_aspect_ratio")}>
            <Select
              value={aspectRatio}
              onChange={setAspectRatio}
              options={VIDEO_ASPECT_RATIOS.map((value) => ({ value, label: value }))}
            />
          </FormField>
          <FormField label={t("video_generation.field_resolution")}>
            <Select
              value={resolution}
              onChange={setResolution}
              options={VIDEO_RESOLUTIONS.map((value) => ({ value, label: value }))}
            />
          </FormField>
        </div>

        {test.running ? (
          <Callout tone="info" icon={<Loader2 className="animate-spin" />} role="status">
            {t("video_generation.test_running_hint")}
            {test.phase ? ` · ${test.phase}` : ""}
          </Callout>
        ) : null}

        {test.error ? (
          <Callout tone="danger" role="alert">
            {test.error}
          </Callout>
        ) : null}

        {test.result?.video?.url ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- generated clip has no track */}
            <video
              src={test.result.video.url}
              controls
              className="w-full rounded-2xl bg-subtle"
            />
            <a
              href={test.result.video.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-ink underline"
            >
              {t("video_generation.result_open_original")}
            </a>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
