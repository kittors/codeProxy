import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { videoGenerationApi, type VideoGenerationModel } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  Card,
  CodeBlock,
  DataTable,
  Tabs,
  TabsList,
  TabsTrigger,
  type DataTableColumn,
} from "@code-proxy/ui";
import {
  VIDEO_ENDPOINT_DOCS,
  VIDEO_STATUS_PATH,
  type SpecRow,
  type VideoEndpointDoc,
} from "./apiDocs";
import { VideoGenerationTestModal } from "./VideoGenerationTestModal";

export function VideoGenerationPageContent() {
  const { t } = useTranslation();

  const [models, setModels] = useState<VideoGenerationModel[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoEndpointDoc["mode"]>("text");
  const [testOpen, setTestOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void videoGenerationApi
      .getModels()
      .then((response) => {
        if (cancelled) return;
        setModels(response.models ?? []);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setModelsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doc = useMemo(
    () => VIDEO_ENDPOINT_DOCS.find((entry) => entry.mode === mode) ?? VIDEO_ENDPOINT_DOCS[0],
    [mode],
  );
  // `available` is undefined on an older server, which must not disable a working page.
  const anyModelAvailable = models.some((entry) => entry.available !== false);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">
          {t("video_generation.title")}
        </h1>
        <p className="text-sm text-ink-3">
          {t("video_generation.description")}
        </p>
      </header>

      {/* flat：整页内容原来包在一张大卡片里；外壳内容区就是页面面板，不再多套一层。 */}
      <Card flat>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-ink">
              {t("video_generation.call_title")}
            </h2>
            <p className="text-sm text-ink-3">
              {t("video_generation.call_description")}
            </p>
          </div>
          <Button onClick={() => setTestOpen(true)} disabled={models.length === 0 || !anyModelAvailable}>
            {t("video_generation.test_button")}
          </Button>
        </div>

        {modelsError ? (
          <Callout tone="danger" role="alert" className="mt-4">
            {modelsError}
          </Callout>
        ) : null}

        {!modelsError && models.length > 0 && !anyModelAvailable ? (
          <Callout tone="warning" className="mt-4">
            {t("video_generation.no_channel_hint")}
          </Callout>
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

        <div className="mt-4 rounded-2xl bg-subtle p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink">
                {t(`video_generation.${doc.titleKey}`)}
              </h3>
              <p className="mt-1 text-sm text-ink-3">
                {t(`video_generation.${doc.descriptionKey}`)}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 font-mono text-xs text-ink-2">
              <span className="font-semibold text-ink">
                {doc.method}
              </span>
              {doc.path}
            </span>
          </div>
        </div>

        <CodeBlock code={doc.curl} label="curl" className="mt-4" />

        <p className="mt-3 text-xs text-ink-3">
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

      <VideoGenerationTestModal
        open={testOpen}
        models={models}
        mode={mode}
        onModeChange={setMode}
        onClose={() => setTestOpen(false)}
      />
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
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <DataTable tableId={tableId} columns={columns} rows={rows} rowKey={(row) => row.name} />
    </section>
  );
}
