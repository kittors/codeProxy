import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Callout, PageLoader, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@code-proxy/ui";
import type { MaskRecord } from "@code-proxy/api-client";
import { clientMeta } from "./maskKinds";
import { MaskingCredit } from "./MaskingCredit";
import { MaskingExplainer } from "./MaskingExplainer";
import { MaskingFeed, type FeedMode } from "./MaskingFeed";
import { MaskingRecordDrawer } from "./MaskingRecordDrawer";
import { MaskingSettingsPanel } from "./MaskingSettingsPanel";
import { MaskingSummaryCard } from "./MaskingSummaryCard";
import { useKindLabel } from "./KindChip";
import { recordByUpstream, summaryByUpstream } from "./portalUpstreams";
import { isPortalMaskingForbidden, portalMaskingSource, tenantMaskingSource, type MaskingSettingsView } from "./source";
import { useMaskingOverview, useMaskingRecord } from "./useMaskingOverview";

type Tab = "overview" | "settings";

/**
 * 设置里要求了任何脱敏：密钥、个人信息，或者有脱敏词、自定义规则（这两样不管开关，单独也会遮）。
 * 门户里强制开启的类目也算：门户用户自己关了，也照样遮。
 */
const maskingOn = (settings: MaskingSettingsView | null, scope: "tenant" | "portal") =>
  !!settings &&
  (settings.policy.secrets ||
    settings.policy.personal ||
    settings.policy.words.length > 0 ||
    settings.policy.rules.length > 0 ||
    (scope === "portal" && settings.enforced.length > 0));

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * 隐私脱敏：「概览」看没让上游看到的（头卡、原理说明、按请求或按值的列表、单条详情），「设置」
 * 配要遮什么、怎么处理、例外和试一试。控制台（scope="tenant"）和门户（scope="portal"）共用，
 * 门户只看得到、只改得了自己名下的。
 *
 * 门户里能不能改以服务器返回的 allowed 为准（页面打开期间管理员可能改了），canWrite 只是上限；
 * 渠道换成上游厂商显示，流向图右边不能点来筛选（门户不显示渠道是谁，见 portalUpstreams.ts）。
 * active 为 false 时概览不自动刷新。子标签栏吸顶要求外面有一个会滚的容器：控制台的内容区，
 * 门户里是这个标签自己的滚动区。
 */
export function PrivacyMaskingWorkspace({
  scope,
  canWrite,
  active = true,
}: {
  scope: "tenant" | "portal";
  canWrite: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const kindLabel = useKindLabel();
  const source = scope === "portal" ? portalMaskingSource : tenantMaskingSource;
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<FeedMode>("request");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<MaskingSettingsView | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);
  const overview = useMaskingOverview(source, active);
  const record = useMaskingRecord(source, openKey);
  const writable = canWrite && (scope !== "portal" || settings?.allowed === true);
  const hideChannels = scope === "portal";
  const otherUpstream = t("privacy_masking.portal.upstream_other");
  const summary = useMemo(
    () => (hideChannels && overview.summary ? summaryByUpstream(overview.summary, otherUpstream) : overview.summary),
    [hideChannels, overview.summary, otherUpstream],
  );
  const records = useMemo(
    () => (hideChannels ? overview.records.map((r) => recordByUpstream(r, otherUpstream)) : overview.records),
    [hideChannels, overview.records, otherUpstream],
  );
  const detail = useMemo(
    () => (hideChannels && record.detail ? recordByUpstream(record.detail, otherUpstream) : record.detail),
    [hideChannels, record.detail, otherUpstream],
  );

  const loadSettings = useCallback(() => {
    setSettingsError("");
    source
      .getSettings()
      .then(setSettings)
      .catch((e: unknown) => setSettingsError(message(e)));
  }, [source]);
  useEffect(loadSettings, [loadSettings]);

  // 保存与恢复默认共用：门户里写入答 403 说明管理员刚收回了权限，重读设置变成只读
  const write = async (run: () => Promise<MaskingSettingsView>, done: string) => {
    setSaving(true);
    try {
      setSettings(await run());
      notify({ type: "success", message: done });
    } catch (e) {
      if (isPortalMaskingForbidden(e)) {
        notify({ type: "error", message: t("privacy_masking.portal.forbidden_now") });
        loadSettings();
      } else {
        notify({ type: "error", message: message(e) });
      }
    } finally {
      setSaving(false);
    }
  };
  const save = (next: MaskingSettingsView) => write(() => source.saveSettings(next), t("privacy_masking.settings.saved"));
  const reset = source.resetSettings
    ? () => write(source.resetSettings!, t("privacy_masking.portal.reset_done"))
    : undefined;

  const { filters, setFilters } = overview;
  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (filters.client) chips.push({ key: "client", label: clientMeta(filters.client).label ?? t("privacy_masking.client.other") });
    if (filters.channel) chips.push({ key: "channel", label: filters.channel });
    if (filters.kind) chips.push({ key: "kind", label: kindLabel(filters.kind) });
    return chips;
  }, [filters, kindLabel, t]);

  const index = records.findIndex((r) => r.key === openKey);
  const openAt = (at: number) => {
    const target = records[at];
    if (target) setOpenKey(target.key);
  };
  const opened: MaskRecord | null = index >= 0 ? records[index] : null;

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)} size="sm">
      <section className="flex flex-col gap-4">
        {/* 门户里上面紧挨着门户自己的标签栏，不再留顶部的空 */}
        <div className={`sticky top-0 z-20 -mx-4 bg-canvas px-4 pb-1 sm:-mx-6 sm:px-6 ${scope === "portal" ? "" : "pt-3"}`}>
          <TabsList aria-label={t("privacy_masking.title")} className="max-w-full">
            <TabsTrigger value="overview">{t("privacy_masking.tab.overview")}</TabsTrigger>
            <TabsTrigger value="settings">
              {scope === "portal" ? t("privacy_masking.portal.tab_settings") : t("privacy_masking.tab.settings")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="flex flex-col gap-4">
            {overview.error ? (
              <Callout tone="danger" role="alert" title={t("privacy_masking.load_failed")}>
                {overview.error}
              </Callout>
            ) : null}
            <MaskingSummaryCard
              summary={summary}
              channelsSelectable={!hideChannels}
              enabled={maskingOn(settings, scope)}
              canTurnOn={writable || settings === null}
              days={overview.days}
              onDays={overview.setDays}
              selectedClient={filters.client}
              selectedChannel={filters.channel}
              onSelect={(side, id) => setFilters((f) => ({ ...f, [side]: id }))}
              onOpenSettings={() => setTab("settings")}
            />
            <MaskingExplainer />
            <MaskingFeed
              summary={summary}
              mode={mode}
              onMode={setMode}
              facet={overview.facet}
              onFacet={(facet) => {
                overview.setFacet(facet);
                setFilters((f) => ({ ...f, kind: "" }));
              }}
              records={records}
              loading={overview.loading}
              loadingMore={overview.loadingMore}
              hasMore={overview.hasMore}
              onLoadMore={overview.loadMore}
              live={!overview.error}
              filters={filterChips}
              onClearFilter={(key) => setFilters((f) => ({ ...f, [key]: "" }))}
              onOpen={(r) => setOpenKey(r.key)}
              onPickKind={(kind) => {
                setMode("request");
                overview.setFacet("");
                setFilters((f) => ({ ...f, kind }));
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="settings">
          {settingsError ? (
            <Callout
              tone="danger"
              role="alert"
              title={t("privacy_masking.settings.load_failed")}
              actions={
                <Button size="sm" variant="secondary" onClick={loadSettings}>
                  {t("common.retry")}
                </Button>
              }
            >
              {settingsError}
            </Callout>
          ) : settings ? (
            <MaskingSettingsPanel
              // 保存、恢复默认、权限变化后都换一份草稿：门户删掉设置时 updated_at 不变，要连 own、allowed 一起看
              key={[settings.updated_at ?? "initial", settings.own, settings.allowed].join(":")}
              settings={settings}
              scope={scope}
              canWrite={writable}
              saving={saving}
              onSave={(next) => void save(next)}
              onReset={reset}
              preview={source.preview}
            />
          ) : (
            <div className="flex items-center justify-center py-16">
              <PageLoader variant="inline" text={t("common.loading")} />
            </div>
          )}
        </TabsContent>
        <MaskingCredit />
      </section>

      <MaskingRecordDrawer
        record={opened}
        detail={detail}
        loading={record.loading}
        onClose={() => setOpenKey(null)}
        onPrev={index > 0 ? () => openAt(index - 1) : undefined}
        onNext={index >= 0 && index < records.length - 1 ? () => openAt(index + 1) : undefined}
      />
    </Tabs>
  );
}
