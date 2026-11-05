import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Callout, PageLoader, Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@code-proxy/ui";
import { privacyMaskingApi, type MaskRecord, type PrivacyMaskSettings } from "@code-proxy/api-client";
import { clientMeta } from "./maskKinds";
import { MaskingCredit } from "./MaskingCredit";
import { MaskingExplainer } from "./MaskingExplainer";
import { MaskingFeed, type FeedMode } from "./MaskingFeed";
import { MaskingRecordDrawer } from "./MaskingRecordDrawer";
import { MaskingSettingsPanel } from "./MaskingSettingsPanel";
import { MaskingSummaryCard } from "./MaskingSummaryCard";
import { useKindLabel } from "./KindChip";
import { useMaskingOverview, useMaskingRecord } from "./useMaskingOverview";

type Tab = "overview" | "settings";

/** 设置里要求了任何脱敏：密钥、个人信息，或者有脱敏词、自定义规则（这两样不管开关，单独也会遮）。 */
const maskingOn = (settings: PrivacyMaskSettings | null) =>
  !!settings &&
  (settings.policy.secrets || settings.policy.personal || settings.policy.words.length > 0 || settings.policy.rules.length > 0);

/**
 * 隐私脱敏：「概览」看没让上游看到的（头卡、原理说明、按请求或按值的列表、单条详情），「设置」
 * 配要遮什么、怎么处理、例外和试一试。控制台（scope="tenant"）和门户（scope="portal"）共用，
 * 门户只看得到、只改得了自己名下的。
 */
export function PrivacyMaskingWorkspace({ scope, canWrite }: { scope: "tenant" | "portal"; canWrite: boolean }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const kindLabel = useKindLabel();
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<FeedMode>("request");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<PrivacyMaskSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [saving, setSaving] = useState(false);
  const overview = useMaskingOverview();
  const record = useMaskingRecord(openKey);

  const loadSettings = useCallback(() => {
    setSettingsError("");
    privacyMaskingApi
      .getSettings()
      .then(setSettings)
      .catch((e: unknown) => setSettingsError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(loadSettings, [loadSettings]);

  const save = async (next: PrivacyMaskSettings) => {
    setSaving(true);
    try {
      const saved = await privacyMaskingApi.putSettings({
        policy: next.policy,
        enforced: next.enforced,
        portal_default_allowed: next.portal_default_allowed,
      });
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

  const index = overview.records.findIndex((r) => r.key === openKey);
  const openAt = (at: number) => {
    const target = overview.records[at];
    if (target) setOpenKey(target.key);
  };
  const opened: MaskRecord | null = index >= 0 ? overview.records[index] : null;

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as Tab)} size="sm">
      <section className="flex flex-col gap-4">
        {/* 钉住区：主内容区的顶部渐隐从这条栏的下沿开始，栏本身不被淡掉。 */}
        <div
          data-scroll-fade-pin="top"
          className="sticky top-0 z-20 -mx-4 bg-canvas px-4 pt-3 pb-1 sm:-mx-6 sm:px-6"
        >
          <TabsList aria-label={t("privacy_masking.title")} className="max-w-full">
            <TabsTrigger value="overview">{t("privacy_masking.tab.overview")}</TabsTrigger>
            <TabsTrigger value="settings">{t("privacy_masking.tab.settings")}</TabsTrigger>
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
              summary={overview.summary}
              enabled={maskingOn(settings)}
              days={overview.days}
              onDays={overview.setDays}
              selectedClient={filters.client}
              selectedChannel={filters.channel}
              onSelect={(side, id) => setFilters((f) => ({ ...f, [side]: id }))}
              onOpenSettings={() => setTab("settings")}
            />
            <MaskingExplainer />
            <MaskingFeed
              summary={overview.summary}
              mode={mode}
              onMode={setMode}
              facet={overview.facet}
              onFacet={(facet) => {
                overview.setFacet(facet);
                setFilters((f) => ({ ...f, kind: "" }));
              }}
              records={overview.records}
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
            <MaskingSettingsPanel key={settings.updated_at ?? "initial"} settings={settings} scope={scope} canWrite={canWrite} saving={saving} onSave={(next) => void save(next)} />
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
        detail={record.detail}
        loading={record.loading}
        onClose={() => setOpenKey(null)}
        onPrev={index > 0 ? () => openAt(index - 1) : undefined}
        onNext={index >= 0 && index < overview.records.length - 1 ? () => openAt(index + 1) : undefined}
      />
    </Tabs>
  );
}
