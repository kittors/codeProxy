import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Callout,
  Card,
  CodeBlock,
  DataGrid,
  GRID_WIDTH,
  surface,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type DataGridColumn,
} from "@code-proxy/ui";
import { useImageGenerationChannels } from "../hooks/useImageGenerationChannels";
import { VISIBLE_ENDPOINT_DOCS, type EndpointDoc, type SpecRow } from "./apiDocs";
import { ImageGenerationTestModal } from "./ImageGenerationTestModal";

/** 唯一的「图片生成」页签的键；测试弹窗实际用哪个模型，取自服务端的模型目录。 */
const FALLBACK_IMAGE_MODEL = "gpt-image-2";

type ImageMode = "generations" | "edits";

export function ImageGenerationPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(FALLBACK_IMAGE_MODEL);
  const [activeMode, setActiveMode] = useState<ImageMode>("generations");
  const {
    loading: channelsLoading,
    channels: availableChannels,
    failed: channelsFailed,
  } = useImageGenerationChannels();

  const [testOpen, setTestOpen] = useState(false);

  const disabled = !channelsLoading && availableChannels.length === 0;
  const activeDoc = useMemo(
    () => VISIBLE_ENDPOINT_DOCS.find((doc) => doc.mode === activeMode) ?? VISIBLE_ENDPOINT_DOCS[0],
    [activeMode],
  );

  const openTest = useCallback(() => {
    if (disabled || channelsLoading) return;
    setTestOpen(true);
  }, [channelsLoading, disabled]);

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight text-ink">
          {t("image_generation.title")}
        </h2>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value={FALLBACK_IMAGE_MODEL}>{t("image_generation.tab_label")}</TabsTrigger>
          </TabsList>

          <TabsContent value={FALLBACK_IMAGE_MODEL} className="mt-4 space-y-4">
            {disabled ? (
              <Callout tone="warning">
                {channelsFailed
                  ? t("image_generation.channels_error")
                  : t("image_generation.channels_empty")}
              </Callout>
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
                  <Tabs
                    value={activeMode}
                    onValueChange={(value) => setActiveMode(value as ImageMode)}
                  >
                    <TabsList>
                      {VISIBLE_ENDPOINT_DOCS.map((doc) => (
                        <TabsTrigger key={doc.mode} value={doc.mode}>
                          {t(doc.titleKey)}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {VISIBLE_ENDPOINT_DOCS.map((doc) => (
                      <TabsContent key={doc.mode} value={doc.mode} className="mt-4">
                        <EndpointCallDoc doc={doc} />
                      </TabsContent>
                    ))}
                  </Tabs>
                  <div className="rounded-inner bg-subtle px-4 py-3 text-xs leading-6 text-ink-2">
                    {t("image_generation.active_endpoint_hint", {
                      method: activeDoc.method,
                      path: activeDoc.path,
                    })}
                  </div>
                </div>
              </Card>

              <div className="grid gap-4 xl:grid-cols-2">
                <SpecTable
                  tableId="image-generation-request-params"
                  title={t("image_generation.request_params_title")}
                  rows={activeDoc.requestRows}
                />
                <SpecTable
                  tableId="image-generation-response-schema"
                  title={t("image_generation.response_schema_title")}
                  rows={activeDoc.responseRows}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      <ImageGenerationTestModal open={testOpen} onClose={() => setTestOpen(false)} />
    </div>
  );
}

function EndpointCallDoc({ doc }: { doc: EndpointDoc }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {/* 卡片里的分组只用无边淡底，圆角取卡片的同心内圆角（rounded-inner）。 */}
      <div className="rounded-inner bg-subtle p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {t(doc.titleKey)}
            </p>
            <p className="mt-1 text-xs leading-5 text-ink-2">
              {t(doc.descriptionKey)}
            </p>
          </div>
          {/* 淡底上的白色胶囊，不描边；请求方法是中性标签，蓝色只留给操作与选中。 */}
          <div className="flex max-w-full items-center gap-2 rounded-full bg-surface px-3 py-1.5 font-mono text-xs">
            <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-semibold text-ink dark:bg-white/[0.1]">
              {doc.method}
            </span>
            <span className="truncate text-ink-2">{doc.path}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2">
          <span className="rounded-full bg-surface px-2.5 py-1">
            Authorization: Bearer YOUR_API_KEY
          </span>
          <span className="rounded-full bg-surface px-2.5 py-1">
            {doc.contentType}
          </span>
        </div>
      </div>

      <CodeBlock code={doc.curl} label="curl" />
      <CodeBlock code={doc.geminiCurl} label={t("image_generation.gemini_curl_label")} />
    </div>
  );
}

function SpecTable({ tableId, title, rows }: { tableId: string; title: string; rows: SpecRow[] }) {
  const { t } = useTranslation();
  const columns = useMemo<DataGridColumn<SpecRow>[]>(
    () => [
      {
        id: "name",
        header: t("image_generation.table_param"),
        width: GRID_WIDTH.badgeStacked,
        // 参数名可能很长（response_format），按字符折行而不是截断：说明文档要看全。
        cell: (row) => (
          <span className="min-w-0 break-all font-mono text-xs leading-5 text-ink">{row.name}</span>
        ),
      },
      {
        id: "type",
        header: t("image_generation.table_type"),
        width: GRID_WIDTH.badge,
        cell: (row) => <span className="truncate font-mono text-xs text-ink-2">{row.type}</span>,
      },
      {
        id: "required",
        header: t("image_generation.table_required"),
        width: GRID_WIDTH.badge,
        cell: (row) => (
          <span className="text-xs text-ink-2">{row.required ? t("common.yes") : t("common.no")}</span>
        ),
      },
      {
        id: "description",
        header: t("image_generation.table_description"),
        width: 240,
        grow: true,
        cell: (row) => <span className="text-xs leading-5 text-ink-2">{t(row.descriptionKey)}</span>,
      },
    ],
    [t],
  );

  return (
    // 和上面的「调用方式」同一层：内容区上的第一层卡片（伪元素细边 + 投影），不套在调用卡片里。
    <div
      data-testid="image-generation-spec-card"
      className={`overflow-hidden p-4 ${surface({ radius: "3xl" })}`}
    >
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <div className="mt-4">
        {/* 卡片里的小表：不再套外框，按行收高。 */}
        <DataGrid<SpecRow>
          id={tableId}
          frame={false}
          rows={rows}
          columns={columns}
          rowKey={(row) => row.name}
          label={`${title} table`}
        />
      </div>
    </div>
  );
}
