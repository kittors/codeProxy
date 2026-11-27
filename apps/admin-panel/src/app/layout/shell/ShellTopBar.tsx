import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import {
  GitHubRepoLink,
  HUE_GLYPH,
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

const TOPBAR_ICON_BUTTON = "sn-btn sn-ghost sn-sm sn-ibtn text-[var(--sn-label2)]";
const CMDK_SHORTCUT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform) ? "⌘K" : "Ctrl K";

/**
 * 壳层顶栏（落在 --sn-shell 统一底座上，高 44px 与左侧 Sidebar 顶栏严格齐平同中轴）：
 * 左侧是「分区 / 页面」位置提示（手机上多一个打开抽屉的按钮），右侧是 ⌘K 命令面板入口、
 * 切换租户、语言、主题与外观（外观在侧边抽屉里调）。
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
  onOpenCommandPalette,
}: {
  titleKey: string;
  sectionLabel: string | null;
  pageLabel: string | null;
  isMobile: boolean;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
  onOpenCommandPalette?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="z-20 flex h-11 shrink-0 items-center gap-2 px-3 sm:px-5">
      <h1 className="sr-only">{t(titleKey)}</h1>
      {isMobile ? (
        <button
          type="button"
          onClick={onToggleMobileNav}
          aria-label={mobileNavOpen ? t("shell.collapse_sidebar") : t("shell.expand_sidebar")}
          className={TOPBAR_ICON_BUTTON}
        >
          <Icon name="panel-left" size={17} />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-hidden="true">
        {sectionLabel && sectionLabel !== pageLabel ? (
          <>
            <span className="hidden truncate text-[var(--sn-label3)] sm:inline">{sectionLabel}</span>
            <span className="hidden text-[var(--sn-label-off)] sm:inline">/</span>
          </>
        ) : null}
        {pageLabel ? <span className="truncate font-medium text-[var(--sn-label)]">{pageLabel}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onOpenCommandPalette ? (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            data-command-palette-trigger="true"
            aria-label={`${t("shell.cmdk_trigger", { defaultValue: "快速跳转…" })} (${CMDK_SHORTCUT})`}
            aria-keyshortcuts="Meta+K Control+K"
            className="cp-cmdk-trigger mr-1"
          >
            <Icon name="search" size={14} />
            <span className="hidden md:inline">
              {t("shell.cmdk_trigger", { defaultValue: "快速跳转…" })}
            </span>
            <kbd className="cp-cmdk-kbd hidden sm:inline-flex">{CMDK_SHORTCUT}</kbd>
          </button>
        ) : null}
        <TenantSwitcher />
        <GitHubRepoLink variant="topbar" />
        <LanguageSelector size="sm" />
        <ThemeToggleButton size="sm" />
        <AppearanceButton className={TOPBAR_ICON_BUTTON} />
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
        icon: <Icon name="house" size={16} className={`shrink-0 text-ink-3 ${HUE_GLYPH.indigo}`} />,
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
