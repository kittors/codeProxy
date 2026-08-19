import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  videoGenerationApi,
  type VideoGenerationModel,
  type VideoGenerationTestResponse,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  CodeBlock,
  DataTable,
  Modal,
  Select,
  Tabs,
  TabsList,
  TabsTrigger,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import {
  VIDEO_ASPECT_RATIOS,
  VIDEO_ENDPOINT_DOCS,
  VIDEO_RESOLUTIONS,
  VIDEO_STATUS_PATH,
  type SpecRow,
  type VideoEndpointDoc,
} from "./apiDocs";

const TASK_POLL_INTERVAL_MS = 2000;
const DEFAULT_DURATION = 6;

type TestState = {
  running: boolean;
  phase: string;
  result: VideoGenerationTestResponse | null;
  error: string | null;
};

const emptyTestState: TestState = { running: false, phase: "", result: null, error: null };

export function VideoGenerationPageContent() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [models, setModels] = useState<VideoGenerationModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoEndpointDoc["mode"]>("text");
  const [testOpen, setTestOpen] = useState(false);
  const [test, setTest] = useState<TestState>(emptyTestState);

  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [aspectRatio, setAspectRatio] = useState(VIDEO_ASPECT_RATIOS[0]);
  const [resolution, setResolution] = useState(VIDEO_RESOLUTIONS[1]);

  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void videoGenerationApi
      .getModels()
      .then((response) => {
        if (cancelled) return;
        const items = response.models ?? [];
        setModels(items);
        setModel((current) => current || (items[0]?.id ?? ""));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setModelsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    },
    [],
  );

  const doc = useMemo(
    () => VIDEO_ENDPOINT_DOCS.find((entry) => entry.mode === mode) ?? VIDEO_ENDPOINT_DOCS[0],
    [mode],
  );
  const selectedModel = useMemo(
    () => models.find((entry) => entry.id === model),
    [model, models],
  );
  const maxDuration = selectedModel?.max_duration_seconds || 15;
  // A model the tenant has no credential for cannot be generated with. Saying so
  // here — instead of letting the request fail with "auth_not_found" — is the
  // difference between an actionable message and a dead end. `available` is
  // undefined on an older server, which must not disable a working page.
  const modelAvailable = selectedModel?.available !== false;
  const anyModelAvailable = models.some((entry) => entry.available !== false);
  const canGenerate = models.length > 0 && modelAvailable;

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

  const handleRunTest = useCallback(() => {
    if (!model.trim()) {
      notify({ type: "warning", message: t("video_generation.test_model_required") });
      return;
    }
    if (!prompt.trim()) {
      notify({ type: "warning", message: t("video_generation.test_prompt_required") });
      return;
    }
    if (mode === "image" && !imageUrl.trim()) {
      notify({ type: "warning", message: t("video_generation.test_image_required") });
      return;
    }

    setTest({ running: true, phase: "queued", result: null, error: null });
    void videoGenerationApi
      .startTestTask({
        model,
        prompt,
        duration,
        aspect_ratio: aspectRatio,
        resolution,
        ...(mode === "image" && imageUrl.trim() ? { image: imageUrl.trim() } : {}),
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
  }, [aspectRatio, duration, imageUrl, mode, model, pollTask, prompt, resolution, notify, t]);

  const modelOptions = useMemo(
    () =>
      models.map((entry) => {
        const base = entry.display_name ? `${entry.display_name} · ${entry.id}` : entry.id;
        return {
          value: entry.id,
          label: entry.available === false ? `${base} (${t("video_generation.unavailable_suffix")})` : base,
        };
      }),
    [models, t],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {t("video_generation.title")}
        </h1>
        <p className="text-sm text-slate-500 dark:text-white/55">
          {t("video_generation.description")}
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {t("video_generation.call_title")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-white/55">
              {t("video_generation.call_description")}
            </p>
          </div>
          <Button onClick={() => setTestOpen(true)} disabled={models.length === 0 || !anyModelAvailable}>
            {t("video_generation.test_button")}
          </Button>
        </div>

        {modelsError ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-300">
            <CircleAlert className="h-4 w-4 shrink-0" />
            {modelsError}
          </p>
        ) : null}

        {!modelsError && models.length > 0 && !anyModelAvailable ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t("video_generation.no_channel_hint")}
          </p>
        ) : null}

        <div className="mt-5">
          <Tabs value={mode} onValueChange={(value) => setMode(value as VideoEndpointDoc["mode"])}>
            <TabsList>
              {VIDEO_ENDPOINT_DOCS.map((entry) => (
                <TabsTrigger key={entry.mode} value={entry.mode}>
                  {t(`video_generation.${entry.titleKey}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-4 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(`video_generation.${doc.titleKey}`)}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/55">
                {t(`video_generation.${doc.descriptionKey}`)}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 font-mono text-xs text-slate-600 dark:bg-neutral-950 dark:text-white/70">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {doc.method}
              </span>
              {doc.path}
            </span>
          </div>
        </div>

        <CodeBlock code={doc.curl} label="curl" className="mt-4" />

        <p className="mt-3 text-xs text-slate-500 dark:text-white/45">
          {t("video_generation.status_endpoint_hint", { path: VIDEO_STATUS_PATH })}
        </p>

        <SpecTable
          title={t("video_generation.request_params_title")}
          rows={doc.requestRows}
          tableId="video-request-params"
        />
        <SpecTable
          title={t("video_generation.response_schema_title")}
          rows={doc.responseRows}
          tableId="video-response-schema"
        />
      </Card>

      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title={t("video_generation.test_title")}
        maxWidth="max-w-[720px]"
      >
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-white/55">
              {t("video_generation.field_model")}
            </span>
            <Select value={model} onChange={(value) => setModel(value)} options={modelOptions} />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500 dark:text-white/55">
              {t("video_generation.field_prompt")}
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
              placeholder={t("video_generation.field_prompt_placeholder")}
            />
          </label>

          {mode === "image" || selectedModel?.supports_image_to_video ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-white/55">
                {t("video_generation.field_image_url")}
              </span>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
                placeholder="https://example.com/still.png"
              />
            </label>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-white/55">
                {t("video_generation.field_duration", { max: maxDuration })}
              </span>
              <input
                type="number"
                min={1}
                max={maxDuration}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value) || DEFAULT_DURATION)}
                className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-white/55">
                {t("video_generation.field_aspect_ratio")}
              </span>
              <Select
                value={aspectRatio}
                onChange={(value) => setAspectRatio(value)}
                options={VIDEO_ASPECT_RATIOS.map((value) => ({ value, label: value }))}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500 dark:text-white/55">
                {t("video_generation.field_resolution")}
              </span>
              <Select
                value={resolution}
                onChange={(value) => setResolution(value)}
                options={VIDEO_RESOLUTIONS.map((value) => ({ value, label: value }))}
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleRunTest} disabled={test.running || !canGenerate}>
              {test.running ? t("video_generation.test_running") : t("video_generation.test_submit")}
            </Button>
            {test.running ? (
              <span className="text-xs text-slate-500 dark:text-white/45">
                {t("video_generation.test_running_hint")}
                {test.phase ? ` · ${test.phase}` : ""}
              </span>
            ) : null}
            {!test.running && !canGenerate ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">
                {t("video_generation.no_channel_hint")}
              </span>
            ) : null}
          </div>

          {test.error ? (
            <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {test.error}
            </p>
          ) : null}

          {test.result?.video?.url ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- generated clip has no track */}
              <video
                src={test.result.video.url}
                controls
                className="w-full rounded-xl border border-slate-900/10 dark:border-white/10"
              />
              <a
                href={test.result.video.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-600 underline dark:text-indigo-400"
              >
                {t("video_generation.result_open_original")}
              </a>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function SpecTable({
  tableId,
  title,
  rows,
}: {
  tableId: string;
  title: string;
  rows: SpecRow[];
}) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<SpecRow>[]>(
    () => [
      {
        key: "name",
        label: t("video_generation.table_param"),
        render: (row) => <span className="font-mono text-xs">{row.name}</span>,
      },
      {
        key: "type",
        label: t("video_generation.table_type"),
        render: (row) => <span className="font-mono text-xs">{row.type}</span>,
      },
      {
        key: "required",
        label: t("video_generation.table_required"),
        render: (row) => (row.required ? t("common.yes") : t("common.no")),
      },
      {
        key: "description",
        label: t("video_generation.table_description"),
        render: (row) => (
          <span className="text-xs">
            {t(`video_generation.${row.descriptionKey}`)}
            {row.defaultValue ? ` (${t("video_generation.table_default")}: ${row.defaultValue})` : ""}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <section className="mt-6 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <DataTable tableId={tableId} columns={columns} rows={rows} rowKey={(row) => row.name} />
    </section>
  );
}
