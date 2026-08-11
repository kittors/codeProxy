import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldBan } from "lucide-react";
import { ipAccessApi, type IpAccessEffect, type IpAccessStatus } from "@code-proxy/api-client";
import { Tabs, TabsContent, TabsList, TabsTrigger, useToast } from "@code-proxy/ui";
import { AccessRulesTab } from "./AccessRulesTab";
import { AttemptsTab } from "./AttemptsTab";
import { ProtectionPolicyTab } from "./ProtectionPolicyTab";
import { ThreatOverviewTab } from "./ThreatOverviewTab";
import { TrustBanner } from "./TrustBanner";

type TabKey = "overview" | "rules" | "policy" | "attempts";

export function IpAccessPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState<IpAccessStatus | null>(null);
  const [pendingRule, setPendingRule] = useState<{ cidr: string; effect: IpAccessEffect } | null>(
    null,
  );
  const [inspectIp, setInspectIp] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await ipAccessApi.status());
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.load_failed"),
      });
    }
  }, [notify, t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const openRuleForm = useCallback((cidr: string, effect: IpAccessEffect) => {
    setPendingRule({ cidr, effect });
    setTab("rules");
  }, []);

  const inspectSource = useCallback((ipPrefix: string) => {
    setInspectIp(ipPrefix);
    setTab("attempts");
  }, []);

  const afterRulesChanged = useCallback(() => {
    // The overview annotates each source with its current rule standing, so a ban
    // made here has to invalidate it or the row keeps reading "no action".
    setRefreshToken((value) => value + 1);
    void loadStatus();
  }, [loadStatus]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
    await loadStatus();
    setRefreshing(false);
  }, [loadStatus]);

  return (
    <section className="flex flex-col gap-3">
      <TrustBanner status={status} />

      <div className="flex flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
              <ShieldBan size={18} className="text-slate-900 dark:text-white" aria-hidden="true" />
              {t("ip_access.page_title")}
            </h2>
            {status ? (
              <div className="hidden min-[720px]:flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                <span className="text-slate-300 dark:text-white/15">|</span>
                <span>
                  {t("ip_access.stat_active_rules")}{" "}
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {status.active_rules}
                  </span>
                </span>
                <span className="text-slate-300 dark:text-white/15">|</span>
                <span>
                  {t("ip_access.stat_auto_ban")}{" "}
                  <span className="font-mono text-slate-900 dark:text-white">
                    {t(`ip_access.auto_ban_mode_${status.auto_ban_mode}`)}
                  </span>
                </span>
                {status.lockdown ? (
                  <>
                    <span className="text-slate-300 dark:text-white/15">|</span>
                    <span className="font-medium text-amber-600 dark:text-amber-400">
                      {t("ip_access.stat_lockdown_on")}
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            aria-busy={refreshing}
            aria-label={t("ip_access.refresh")}
            title={t("ip_access.refresh")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white/15"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
              aria-hidden="true"
            />
          </button>
        </div>

        <Tabs value={tab} onValueChange={(next) => setTab(next as TabKey)} size="sm">
          <div className="px-5 pb-3">
            <TabsList aria-label={t("ip_access.page_title")} className="max-w-full">
              <TabsTrigger value="overview">{t("ip_access.tab_overview")}</TabsTrigger>
              <TabsTrigger value="rules">{t("ip_access.tab_rules")}</TabsTrigger>
              <TabsTrigger value="policy">{t("ip_access.tab_policy")}</TabsTrigger>
              <TabsTrigger value="attempts">{t("ip_access.tab_attempts")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <ThreatOverviewTab
              refreshToken={refreshToken}
              onBan={(cidr) => openRuleForm(cidr, "deny")}
              onAllow={(cidr) => openRuleForm(cidr, "allow")}
              onInspect={inspectSource}
            />
          </TabsContent>

          <TabsContent value="rules">
            <AccessRulesTab
              pendingRule={pendingRule}
              onPendingRuleHandled={() => setPendingRule(null)}
              onRulesChanged={afterRulesChanged}
              refreshToken={refreshToken}
              protectedEntries={status?.protected ?? []}
            />
          </TabsContent>

          <TabsContent value="policy">
            <ProtectionPolicyTab status={status} onPolicySaved={afterRulesChanged} />
          </TabsContent>

          <TabsContent value="attempts">
            <AttemptsTab ipFilter={inspectIp} refreshToken={refreshToken} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
