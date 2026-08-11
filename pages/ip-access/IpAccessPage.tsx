import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
    // The overview annotates each source with its current rule standing, so a
    // ban made here has to invalidate it or the row keeps reading "no action".
    setRefreshToken((value) => value + 1);
    void loadStatus();
  }, [loadStatus]);

  return (
    <section className="flex flex-1 flex-col gap-3">
      <TrustBanner status={status} />

      <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("ip_access.page_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("ip_access.page_description")}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(next) => setTab(next as TabKey)} size="sm">
          <TabsList aria-label={t("ip_access.page_title")} className="mx-5 max-w-full">
            <TabsTrigger value="overview">{t("ip_access.tab_overview")}</TabsTrigger>
            <TabsTrigger value="rules">{t("ip_access.tab_rules")}</TabsTrigger>
            <TabsTrigger value="policy">{t("ip_access.tab_policy")}</TabsTrigger>
            <TabsTrigger value="attempts">{t("ip_access.tab_attempts")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex min-h-0 flex-1 flex-col px-5 pb-4">
            <ThreatOverviewTab
              refreshToken={refreshToken}
              onBan={(cidr) => openRuleForm(cidr, "deny")}
              onAllow={(cidr) => openRuleForm(cidr, "allow")}
              onInspect={inspectSource}
            />
          </TabsContent>

          <TabsContent value="rules" className="flex min-h-0 flex-1 flex-col px-5 pb-4">
            <AccessRulesTab
              pendingRule={pendingRule}
              onPendingRuleHandled={() => setPendingRule(null)}
              onRulesChanged={afterRulesChanged}
            />
          </TabsContent>

          <TabsContent value="policy" className="flex min-h-0 flex-1 flex-col px-5 pb-4">
            <ProtectionPolicyTab status={status} onPolicySaved={afterRulesChanged} />
          </TabsContent>

          <TabsContent value="attempts" className="flex min-h-0 flex-1 flex-col px-5 pb-4">
            <AttemptsTab ipFilter={inspectIp} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
