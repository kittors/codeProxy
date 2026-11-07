import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Callout, PageLoader, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@code-proxy/ui";
import {
  privacyMaskingApi,
  privacyMaskingPortalApi,
  type MaskRecord,
  type PortalPrivacyMaskSettings,
  type PrivacyMaskPolicy,
  type PrivacyMaskSettings,
} from "@code-proxy/api-client";
import { clientMeta } from "./maskKinds";
import { MaskingCredit } from "./MaskingCredit";
import { MaskingExplainer } from "./MaskingExplainer";
import { MaskingFeed, type FeedMode } from "./MaskingFeed";
import { MaskingRecordDrawer } from "./MaskingRecordDrawer";
import { MaskingRulesView } from "./MaskingRulesView";
import { MaskingSettingsPanel } from "./MaskingSettingsPanel";
import { MaskingSummaryCard } from "./MaskingSummaryCard";
import { useKindLabel } from "./KindChip";
import { recordByUpstream, summaryByUpstream } from "./portalUpstreams";
import { portalMaskingSource, tenantMaskingSource } from "./source";
import { useMaskingOverview, useMaskingRecord } from "./useMaskingOverview";

type Tab = "overview" | "settings";

/** 设置里要求了任何脱敏：密钥、个人信息，或者有脱敏词、自定义规则（这两样不管开关，单独也会遮）。 */
const maskingOn = (settings: { policy: PrivacyMaskPolicy } | null) =>
  !!settings &&
  (settings.policy.secrets || settings.policy.personal || settings.policy.words.length > 0 || settings.policy.rules.length > 0);

/**
 * 隐私脱敏：「概览」看没让上游看到的（头卡、原理说明、按请求或按值的列表、单条详情）。控制台
 * （scope="tenant"）和门户（scope="portal"）共用。
 *
 * - 控制台另有「设置」：配要遮什么、怎么处理、例外和试一试。
 * - 门户只读：要不要脱敏、遮什么全由租户管理员决定，门户只让用户知道脱敏怎么做、自己的请求遮了
 *   什么。第二个标签是「生效的规则」（只读的规则加试一试），不调任何写接口；canWrite 不起作用。
 *   门户的设置形状和控制台的不同（privacyMaskingPortalApi），单独存一份。服务器关掉了脱敏时
 *   如实说明。渠道换成上游厂商显示，流向图右边不能点来筛选（门户不显示渠道是谁，见
 *   portalUpstreams.ts）。active 为 false 时概览不自动刷新。
 *
 * 子标签栏吸顶要外面有一个会滚的容器：控制台的内容区，门户里是这个标签自己的滚动区。
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
  const portal = scope === "portal";
  const source = portal ? portalMaskingSource : tenantMaskingSource;
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<FeedMode>("request");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<PrivacyMaskSettings | null>(null);
  const [portalSettings, setPortalSettings] = useState<PortalPrivacyMaskSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);
  const overview = useMaskingOverview(source, active);
  const record = useMaskingRecord(source, openKey);
  const otherUpstream = t("privacy_masking.portal.upstream_other");
  const summary = useMemo(
    () => (portal && overview.summary ? summaryByUpstream(overview.summary, otherUpstream) : overview.summary),
    [portal, overview.summary, otherUpstream],
  );
  const records = useMemo(
    () => (portal ? overview.records.map((r) => recordByUpstream(r, otherUpstream)) : overview.records),
    [portal, overview.records, otherUpstream],
  );
  const detail = useMemo(
    () => (portal && record.detail ? recordByUpstream(record.detail, otherUpstream) : record.detail),
    [portal, record.detail, otherUpstream],
  );

  const loadSettings = useCallback(() => {
    setSettingsError("");
    const loaded = portal
      ? privacyMaskingPortalApi.getSettings().then(setPortalSettings)
      : privacyMaskingApi.getSettings().then(setSettings);
    loaded.catch((e: unknown) => setSettingsError(e instanceof Error ? e.message : String(e)));
  }, [portal]);
  useEffect(loadSettings, [loadSettings]);

  const save = async (next: PrivacyMaskSettings) => {
    setSaving(true);
    try {
      const saved = await privacyMaskingApi.putSettings({ policy: next.policy });
      setSettings(saved);
      notify({ type: "success", message: t("privacy_masking.settings.saved") });
    } catch (e) {
      notify({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

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
        {/* 钉住区：外面滚动区的顶部渐隐从这条栏的下沿开始，栏本身不被淡掉。门户里上面紧挨着门户
            自己的标签栏，不再留顶部的空。右边的 actionsSlot 放设置页的「未保存 · 放弃 · 保存」
            （MaskingSettingsPanel portal 进来），钉住区只有这一条，不会两条都吸在 top-0 互相盖住。 */}
        <div
          data-scroll-fade-pin="top"
          className={`sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-2 bg-canvas px-4 pb-1 sm:-mx-6 sm:px-6 ${portal ? "" : "pt-3"}`}
        >
          <TabsList aria-label={t("privacy_masking.title")} className="max-w-full">
            <TabsTrigger value="overview">{t("privacy_masking.tab.overview")}</TabsTrigger>
            <TabsTrigger value="settings">
              {portal ? t("privacy_masking.portal.tab_rules") : t("privacy_masking.tab.settings")}
            </TabsTrigger>
          </TabsList>
          <div ref={setActionsSlot} className="ml-auto flex flex-wrap items-center justify-end gap-2 empty:hidden" />
        </div>

        {portalSettings?.server_disabled ? (
          <Callout tone="warning" role="status">
            {t("privacy_masking.portal.server_disabled")}
          </Callout>
        ) : null}

        <TabsContent value="overview">
          <div className="flex flex-col gap-4">
            {overview.error ? (
              <Callout tone="danger" role="alert" title={t("privacy_masking.load_failed")}>
                {overview.error}
              </Callout>
            ) : null}
            <MaskingSummaryCard
              summary={summary}
              scope={scope}
              enabled={portal ? !portalSettings?.server_disabled && maskingOn(portalSettings) : maskingOn(settings)}
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
          ) : portalSettings ? (
            <MaskingRulesView settings={portalSettings} />
          ) : settings ? (
            <MaskingSettingsPanel key={settings.updated_at ?? "initial"} settings={settings} scope={scope} canWrite={canWrite} saving={saving} onSave={(next) => void save(next)} actionsSlot={actionsSlot} />
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
