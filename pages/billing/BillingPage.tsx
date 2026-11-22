import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Wallet } from "lucide-react";
import {
  apiKeyPermissionProfilesApi,
  billingAdminApi,
  endUsersApi,
  type ApiKeyPermissionProfile,
  type BillingBinding,
  type BillingPlan,
  type BillingSettings,
  type BillingTargetKind,
  type EndUser,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  EmptyState,
  PageLoader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { BindingsTab } from "./BindingsTab";
import { GatewaySettingsTab } from "./GatewaySettingsTab";
import { OrdersTab } from "./OrdersTab";
import { PlansTab } from "./PlansTab";

type BillingTabKey = "gateway" | "plans" | "bindings" | "orders";

function BillingWorkspace() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("tenant_settings.write") ?? true;
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTabParam = searchParams.get("tab");
  const [tab, setTab] = useState<BillingTabKey>(
    initialTabParam === "plans" ||
      initialTabParam === "bindings" ||
      initialTabParam === "orders"
      ? initialTabParam
      : "gateway",
  );
  const [initialTarget, setInitialTarget] = useState<{
    kind: BillingTargetKind;
    id: string;
  } | null>(() => {
    const kind = searchParams.get("target_kind");
    const id = searchParams.get("target_id");
    if ((kind === "api_key" || kind === "end_user") && id) {
      return { kind, id };
    }
    return null;
  });

  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [bindings, setBindings] = useState<BillingBinding[]>([]);
  const [users, setUsers] = useState<EndUser[]>([]);
  const [keysByUser, setKeysByUser] = useState<Record<string, EndUserAPIKey[]>>({});
  const [profiles, setProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [st, pl, bd, userRes, profileRes] = await Promise.all([
        billingAdminApi.getSettings(),
        billingAdminApi.listPlans(),
        billingAdminApi.listBindings(),
        endUsersApi.list().catch(() => ({ items: [] as EndUser[] })),
        apiKeyPermissionProfilesApi
          .listDetailed()
          .catch(() => ({ items: [] as ApiKeyPermissionProfile[] })),
      ]);
      setSettings(st);
      setPlans(pl);
      setBindings(bd);
      setUsers(userRes.items);
      setProfiles(profileRes.items);

      // Load owned keys per user so admins can bind plans to any specific API key.
      const keyEntries = await Promise.all(
        userRes.items.map(async (u) => {
          try {
            const res = await endUsersApi.listKeys(u.id);
            return [u.id, res.items] as const;
          } catch {
            return [u.id, [] as EndUserAPIKey[]] as const;
          }
        }),
      );
      setKeysByUser(Object.fromEntries(keyEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleClearInitialTarget = useCallback(() => {
    setInitialTarget(null);
    if (searchParams.has("target_kind") || searchParams.has("target_id")) {
      const next = new URLSearchParams(searchParams);
      next.delete("target_kind");
      next.delete("target_id");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (loading && !settings) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }

  if (error || !settings) {
    return (
      <Callout
        tone="danger"
        title={t("billing.load_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={() => void loadWorkspace()}>
            {t("common.retry")}
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(next) => setTab(next as BillingTabKey)} size="sm">
      <section className="flex flex-col gap-4">
        <div className="sticky top-0 z-20 -mx-4 bg-canvas px-4 pt-3 pb-1 sm:-mx-6 sm:px-6">
          <TabsList aria-label={t("shell.nav_billing")} className="max-w-full">
            <TabsTrigger value="gateway">{t("billing_admin.tab_gateway")}</TabsTrigger>
            <TabsTrigger value="plans">{t("billing_admin.tab_plans")}</TabsTrigger>
            <TabsTrigger value="bindings">{t("billing_admin.tab_bindings")}</TabsTrigger>
            <TabsTrigger value="orders">{t("billing_admin.tab_orders")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="gateway" className="mt-0">
          <GatewaySettingsTab settings={settings} canWrite={canWrite} onSaved={setSettings} />
        </TabsContent>

        <TabsContent value="plans" className="mt-0">
          <PlansTab
            plans={plans}
            profiles={profiles}
            canWrite={canWrite}
            onReload={loadWorkspace}
          />
        </TabsContent>

        <TabsContent value="bindings" className="mt-0">
          <BindingsTab
            bindings={bindings}
            plans={plans}
            users={users}
            keysByUser={keysByUser}
            canWrite={canWrite}
            initialTarget={initialTarget}
            onClearInitialTarget={handleClearInitialTarget}
            onReload={loadWorkspace}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-0">
          <OrdersTab
            plans={plans}
            users={users}
            keysByUser={keysByUser}
            canWrite={canWrite}
            onOrderMutated={loadWorkspace}
          />
        </TabsContent>
      </section>
    </Tabs>
  );
}

export function BillingPage() {
  const { t } = useTranslation();
  const caps = useConfigCapabilities();

  if (caps.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }
  if (caps.status === "error") {
    return (
      <Callout
        tone="danger"
        title={t("billing.load_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={caps.reload}>
            {t("common.retry")}
          </Button>
        }
      >
        {caps.message}
      </Callout>
    );
  }
  if (!caps.capabilities.billing) {
    return (
      <EmptyState
        icon={<Wallet size={28} />}
        title={t("billing_admin.unsupported_backend_title")}
        description={t("billing_admin.unsupported_backend_desc")}
      />
    );
  }
  return <BillingWorkspace />;
}
