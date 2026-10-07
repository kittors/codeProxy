import { FileJson } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { VendorIcon } from "@code-proxy/assets";
import { NavList, type NavListGroup } from "@code-proxy/ui";
import { ACCOUNT_GROUPS, type AccountProvider, type AccountProviderId } from "../model/catalog";

export function ProviderGlyph({
  provider,
  size = 18,
}: {
  provider: AccountProvider;
  size?: number;
}) {
  return provider.icon ? (
    <VendorIcon modelId={provider.icon} size={size} />
  ) : (
    <FileJson size={size} className="text-ink-2" aria-hidden="true" />
  );
}

const TAB_ID_PREFIX = "add-account-tab";
export const providerTabId = (id: AccountProviderId) => `${TAB_ID_PREFIX}-${id}`;
export const PROVIDER_PANEL_ID = "add-account-panel";

/**
 * The left column: every way to add an account, grouped by what the operator
 * will have to do (sign in in the browser, approve a code, or hand over a
 * credential). A vertical tab list, so arrow keys move through it.
 */
export function ProviderList({
  providers,
  value,
  onChange,
}: {
  providers: readonly AccountProvider[];
  value: AccountProviderId;
  onChange: (id: AccountProviderId) => void;
}) {
  const { t } = useTranslation();
  const groups = useMemo<NavListGroup[]>(
    () =>
      ACCOUNT_GROUPS.map((group) => ({
        id: group,
        label: t(`add_account.groups.${group}`),
        items: providers
          .filter((provider) => provider.group === group)
          .map((provider) => ({
            id: provider.id,
            label: t(`add_account.providers.${provider.copyKey}.name`),
            icon: <ProviderGlyph provider={provider} size={16} />,
          })),
      })),
    [providers, t],
  );

  return (
    <NavList
      mode="tabs"
      groups={groups}
      value={value}
      onChange={(id) => onChange(id as AccountProviderId)}
      ariaLabel={t("add_account.list_label")}
      idPrefix={TAB_ID_PREFIX}
      panelId={PROVIDER_PANEL_ID}
    />
  );
}
