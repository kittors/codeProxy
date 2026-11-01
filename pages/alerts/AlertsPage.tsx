import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, Save, Undo2 } from "lucide-react";
import {
  Button,
  Callout,
  EmptyState,
  PageLoader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { EventsPanel } from "./EventsPanel";
import { NotifyPanel } from "./NotifyPanel";
import { RulesPanel } from "./RulesPanel";
import { useAlertEvents } from "./useAlertEvents";
import { useAlertSettings } from "./useAlertSettings";
import { useChannelTest } from "./useChannelTest";

type TabKey = "notify" | "rules" | "events";

/** 后端退回的字段路径属于哪个页签：保存失败后跳到那一页，字段旁的提示才看得见。 */
const tabOfField = (field: string): TabKey | null => {
  if (field.startsWith("rules.")) return "rules";
  if (
    field === "enabled" ||
    field === "language" ||
    field === "cooldown_minutes" ||
    field.startsWith("channels")
  ) {
    return "notify";
  }
  return null;
};

function AlertsWorkspace() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("tenant_settings.write") ?? true;
  const [tab, setTab] = useState<TabKey>("notify");

  const settings = useAlertSettings(i18n.resolvedLanguage || i18n.language || "en");
  const events = useAlertEvents(tab === "events");
  const channelTest = useChannelTest();

  const { dirty, saving, saveError, save, status } = settings;
  // 后端没有设置库时写入一律 503：和没有权限一样整页只读，别让人改完才被退回。
  const persistent = settings.settings?.persistent !== false;
  const locked = !canWrite || !persistent;
  // 保存期间输入也锁住：保存成功后草稿会换成后端返回的那份，这段时间里改的内容会被悄悄盖掉。
  const frozen = locked || saving;
  const hasIssues = Object.keys(settings.issues).length > 0;

  useEffect(() => {
    const target = saveError ? tabOfField(saveError.field) : null;
    if (target) setTab(target);
  }, [saveError]);

  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const handleSave = useCallback(async () => {
    if (await save()) notify({ type: "success", message: t("alerts_page.saved_toast") });
  }, [notify, save, t]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }
  if (status === "error" || !settings.draft) {
    return (
      <Callout
        tone="danger"
        role="alert"
        title={t("alerts_page.load_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={settings.reload}>
            {t("common.retry")}
          </Button>
        }
      >
        {settings.loadError}
      </Callout>
    );
  }

  const draft = settings.draft;

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as TabKey)} size="sm">
      <section className="flex flex-col gap-4">
        {/*
          页签和保存按钮钉在顶部：通道多了页面会很长，改完往下滚也要够得着保存。保存失败的原因放在
          同一层，否则滚在下面点了保存，错误出现在视口外。
        */}
        <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-canvas px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList aria-label={t("nav.alerts")} className="max-w-full">
              <TabsTrigger value="notify">{t("alerts_page.tab.notify")}</TabsTrigger>
              <TabsTrigger value="rules">{t("alerts_page.tab.rules")}</TabsTrigger>
              <TabsTrigger value="events">{t("alerts_page.tab.events")}</TabsTrigger>
            </TabsList>
            {tab === "events" ? null : (
              <div className="flex flex-wrap items-center gap-2">
                {dirty ? (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-200"
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500" />
                    {t("alerts_page.unsaved")}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!dirty || saving || locked}
                  onClick={settings.discard}
                >
                  <Undo2 size={14} aria-hidden="true" />
                  {t("alerts_page.discard")}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!dirty || hasIssues || saving || locked}
                  aria-busy={saving}
                  title={hasIssues ? t("alerts_page.fix_errors") : undefined}
                  onClick={() => void handleSave()}
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? t("common.saving") : t("common.save")}
                </Button>
              </div>
            )}
          </div>
          {saveError ? (
            <Callout tone="danger" role="alert" title={t("alerts_page.save_failed")}>
              {saveError.message}
            </Callout>
          ) : null}
        </div>

        {!persistent ? (
          <Callout tone="warning">{t("alerts_page.not_persistent")}</Callout>
        ) : !canWrite ? (
          <Callout tone="neutral">{t("alerts_page.read_only")}</Callout>
        ) : null}

        <TabsContent value="notify">
          <NotifyPanel
            draft={draft}
            update={settings.update}
            issues={settings.issues}
            saveError={saveError}
            locked={frozen}
            maxChannels={settings.settings?.limits?.max_channels}
            changedChannelKeys={settings.changedChannelKeys}
            testPendingKey={channelTest.pendingKey}
            testResults={channelTest.results}
            onTest={(channel) => void channelTest.run(channel)}
          />
        </TabsContent>
        <TabsContent value="rules">
          <RulesPanel
            rules={draft.rules}
            update={settings.update}
            saveError={saveError}
            locked={frozen}
          />
        </TabsContent>
        <TabsContent value="events">
          <EventsPanel
            items={events.items}
            total={events.total}
            error={events.error}
            loading={events.loading}
            onReload={events.reload}
          />
        </TabsContent>
      </section>
    </Tabs>
  );
}

/**
 * 「告警」页：通知通道、告警规则、最近记录。
 *
 * 面板会自动更新到最新 release，旧后端没有告警接口，所以先看后端在 GET /config 里有没有声明
 * `alerts`：没声明就只给一张说明，不发任何 /alerts 请求；「读不到声明」（网络、权限）和「没声明」
 * 分开处理，前者可以重试。
 */
export function AlertsPage() {
  const { t } = useTranslation();
  const capabilities = useConfigCapabilities();

  if (capabilities.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }
  if (capabilities.status === "error") {
    return (
      <Callout
        tone="danger"
        role="alert"
        title={t("alerts_page.capability_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={capabilities.reload}>
            {t("common.retry")}
          </Button>
        }
      >
        {capabilities.message}
      </Callout>
    );
  }
  if (!capabilities.capabilities.alerts) {
    return (
      <EmptyState
        icon={<BellOff size={20} aria-hidden="true" />}
        title={t("alerts_page.unsupported_title")}
        description={t("alerts_page.unsupported_desc")}
      />
    );
  }
  return <AlertsWorkspace />;
}
