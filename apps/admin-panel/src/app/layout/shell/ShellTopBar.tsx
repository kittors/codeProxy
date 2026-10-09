import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, PanelLeft } from "lucide-react";
import {
  iconHueClass,
  LanguageSelector,
  SearchableSelect,
  ThemeToggleButton,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  identityApi,
  IDENTITY_TENANTS_UPDATED_EVENT,
  type TenantIdentity,
} from "@code-proxy/api-client";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { AppearanceButton } from "./appearance/AppearanceButton";
import { tenantDisplayName } from "./navModel";

const TOPBAR_ICON_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 ease-soft hover:bg-hover hover:text-ink";

/**
 * 内容区顶栏：左侧是「分区 / 页面」位置提示（手机上多一个打开抽屉的按钮），右侧是切换租户、
 * 语言、主题与外观（外观在侧边抽屉里调）。不画分隔线、不加底色，和内容区连成一片。
 *
 * 页面标题仍是一个只给读屏的 h1：各页面自己的卡片里已经有可见标题，这里再放一个可见的
 * 大标题会重复，也会让「按名称找 heading」的测试多匹配一个。
 */
export function ShellTopBar({
  titleKey,
  sectionLabel,
  pageLabel,
  isMobile,
  mobileNavOpen,
  onToggleMobileNav,
}: {
  titleKey: string;
  sectionLabel: string | null;
  pageLabel: string | null;
  isMobile: boolean;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="z-20 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-6">
      <h1 className="sr-only">{t(titleKey)}</h1>
      {isMobile ? (
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label={mobileNavOpen ? t("shell.collapse_sidebar") : t("shell.expand_sidebar")}
          className={`${TOPBAR_ICON_BUTTON} w-9`}
        >
          <PanelLeft size={20} />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-hidden="true">
        {sectionLabel && sectionLabel !== pageLabel ? (
          <>
            <span className="hidden truncate text-ink-3 sm:inline">{sectionLabel}</span>
            <span className="hidden text-ink-4 sm:inline">/</span>
          </>
        ) : null}
        {pageLabel ? <span className="truncate font-medium text-ink">{pageLabel}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <TenantSwitcher />
        <LanguageSelector className={`${TOPBAR_ICON_BUTTON} gap-0.5 px-2.5`} />
        <ThemeToggleButton className={`${TOPBAR_ICON_BUTTON} w-9`} />
        <AppearanceButton className={`${TOPBAR_ICON_BUTTON} w-9`} />
      </div>
    </header>
  );
}

/**
 * 平台管理员（非服务凭据登录）才能切换租户；只有一个可选租户时整个控件不显示。
 * 租户被新建/改名/删除后，管理页会派发 IDENTITY_TENANTS_UPDATED_EVENT，这里据此重新拉取，
 * 不需要重挂整个外壳。
 */
function TenantSwitcher() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const canSwitchTenants =
    auth?.state.principal?.platform_admin && auth.state.principal.kind !== "service_credential";
  const [tenants, setTenants] = useState<TenantIdentity[]>([]);
  const [tenantSwitching, setTenantSwitching] = useState(false);
  const [tenantsEpoch, setTenantsEpoch] = useState(0);

  useEffect(() => {
    if (!canSwitchTenants) {
      setTenants([]);
      return;
    }
    let cancelled = false;
    void identityApi
      .tenants()
      .then((response) => {
        if (cancelled) return;
        setTenants(
          (response.items ?? []).filter(
            (tenant) => tenant.type === "system" || tenant.effective_status === "active",
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setTenants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canSwitchTenants, tenantsEpoch]);

  useEffect(() => {
    if (!canSwitchTenants) return;
    const onTenantsUpdated = () => setTenantsEpoch((epoch) => epoch + 1);
    window.addEventListener(IDENTITY_TENANTS_UPDATED_EVENT, onTenantsUpdated);
    return () => window.removeEventListener(IDENTITY_TENANTS_UPDATED_EVENT, onTenantsUpdated);
  }, [canSwitchTenants]);

  const systemTenantLabel = t("shell.system_tenant");
  const effectiveTenant = auth?.state.principal?.effective_tenant;
  const effectiveTenantId = effectiveTenant?.id ?? "";
  const tenantOptions = useMemo<SearchableSelectOption[]>(() => {
    const byId = new Map<string, TenantIdentity>();
    for (const tenant of tenants) byId.set(tenant.id, tenant);
    if (effectiveTenant && !byId.has(effectiveTenant.id)) {
      byId.set(effectiveTenant.id, effectiveTenant);
    }
    return Array.from(byId.values()).map((tenant) => {
      const label = tenantDisplayName(tenant, systemTenantLabel);
      return {
        value: tenant.id,
        label,
        searchText: `${label} ${tenant.slug ?? ""} ${tenant.name}`,
        icon: <Building2 size={16} className={`shrink-0 text-ink-3 ${iconHueClass(Building2)}`} />,
      };
    });
  }, [effectiveTenant, systemTenantLabel, tenants]);

  const handleTenantChange = useCallback(
    (tenantId: string) => {
      if (!auth || tenantId === effectiveTenantId || tenantSwitching) return;
      setTenantSwitching(true);
      void auth.actions
        .switchTenant(tenantId)
        .catch(() => undefined)
        .finally(() => setTenantSwitching(false));
    },
    [auth, effectiveTenantId, tenantSwitching],
  );

  // Single-tenant installs have nothing to switch to — hide the control entirely
  // (including the system-admin-only bootstrap case).
  if (!canSwitchTenants || !auth?.state.principal || tenantOptions.length <= 1) return null;

  return (
    <SearchableSelect
      variant="ghost"
      value={effectiveTenantId}
      onChange={handleTenantChange}
      options={tenantOptions}
      disabled={tenantSwitching}
      aria-label={t("shell.switch_tenant")}
      searchPlaceholder={t("shell.search_tenant")}
      placeholder={t("shell.switch_tenant")}
      // 手机上顶栏放不下，切换租户留给更宽的屏幕；用 max-sm:hidden 而不是 hidden + sm:inline-flex，
      // 免得 hidden 和触发器自带的 inline-flex 互相覆盖、结果取决于样式输出顺序。
      className="max-w-64 max-sm:hidden [&>span:first-child]:max-w-52 [&>span:first-child]:flex-none"
    />
  );
}
