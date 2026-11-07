import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe2, Lock, Share2, Users } from "lucide-react";
import type { ResourceSharing, ResourceSharingInput } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ChoiceCards,
  FormField,
  Modal,
  SearchableCheckboxMultiSelect,
  type ChoiceCardOption,
  type SearchableCheckboxMultiSelectOption,
} from "@code-proxy/ui";
import { isSharingTenantInactive, type SharingTenant } from "./sharingTenants";

export type ResourceSharingKind = "proxy" | "auth";

type SharingMode = "none" | "all" | "tenants";

const FORM_ID = "resource-sharing-form";

const modeOf = (sharing: ResourceSharing | null): SharingMode =>
  !sharing ? "none" : sharing.all ? "all" : "tenants";

export interface ResourceSharingModalProps {
  open: boolean;
  kind: ResourceSharingKind;
  /** 单个资源的名称；批量（count > 1）时标题改为「N 个账号」。 */
  resourceName?: string;
  count?: number;
  /** 当前共享设置；批量且各资源不一致时传 mixed。 */
  value: ResourceSharing | null;
  mixed?: boolean;
  tenants: readonly SharingTenant[];
  tenantsLoading?: boolean;
  tenantsError?: string;
  saving?: boolean;
  onSave: (input: ResourceSharingInput) => void;
  onClose: () => void;
}

/**
 * 平台共享设置：不共享 / 共享给所有租户（含以后新建的）/ 指定租户。代理与账号共用，账号可批量。
 *
 * 只有系统租户的资源能共享、只有平台管理员能改，入口由调用方按后端的 `sharing.manageable` 控制；
 * 弹窗本身只负责把选择说清楚：被授权租户能看到什么、看不到什么，以及改动会同步影响它们。
 */
export function ResourceSharingModal({
  open,
  kind,
  resourceName,
  count = 1,
  value,
  mixed = false,
  tenants,
  tenantsLoading = false,
  tenantsError,
  saving = false,
  onSave,
  onClose,
}: ResourceSharingModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<SharingMode>("none");
  const [tenantIds, setTenantIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  // 只在打开的那一刻按当前设置初始化；之后父组件重渲染不能把正在编辑的选择冲掉。
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setMode(mixed ? "none" : modeOf(value));
      setTenantIds(!mixed && value && !value.all ? value.tenantIds : []);
      setSubmitted(false);
    }
  }

  const grantableTenants = useMemo(() => tenants.filter((tenant) => !tenant.system), [tenants]);

  const tenantOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const known = new Set(grantableTenants.map((tenant) => tenant.id));
    const options: SearchableCheckboxMultiSelectOption[] = grantableTenants.map((tenant) => {
      const inactive = isSharingTenantInactive(tenant);
      return {
        value: tenant.id,
        // label 是节点时，触发器上的已选摘要读 searchText，所以 searchText 只放名称。
        label: <span className={inactive ? "text-ink-3" : undefined}>{tenant.name}</span>,
        searchText: tenant.name,
        title: tenant.name,
        trailing: inactive ? (
          <span className="rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-3 dark:bg-white/[0.07]">
            {t(`resource_sharing.tenant_status_${tenant.status}`, {
              defaultValue: t("resource_sharing.tenant_status_inactive"),
            })}
          </span>
        ) : undefined,
      };
    });
    // 已授权、目录里却查不到的租户按 ID 列出：不列出来，这条授权在界面上就没法撤销。
    for (const id of tenantIds) {
      if (known.has(id)) continue;
      options.push({
        value: id,
        label: id,
        searchText: id,
        trailing: (
          <span className="rounded-full bg-amber-500/12 px-1.5 py-0.5 text-2xs font-medium text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">
            {t("resource_sharing.tenant_unknown")}
          </span>
        ),
      });
    }
    return options;
  }, [grantableTenants, t, tenantIds]);

  const modeOptions = useMemo<ChoiceCardOption<SharingMode>[]>(
    () => [
      {
        value: "none",
        label: t("resource_sharing.mode_none"),
        description: t("resource_sharing.mode_none_desc"),
        icon: <Lock />,
      },
      {
        value: "all",
        label: t("resource_sharing.mode_all"),
        description: t("resource_sharing.mode_all_desc"),
        icon: <Globe2 />,
      },
      {
        value: "tenants",
        label: t("resource_sharing.mode_tenants"),
        description: t("resource_sharing.mode_tenants_desc"),
        icon: <Users />,
      },
    ],
    [t],
  );

  const tenantsMissing = mode === "tenants" && tenantIds.length === 0;
  const tenantError =
    submitted && tenantsMissing ? t("resource_sharing.tenants_required") : undefined;

  const submit = () => {
    setSubmitted(true);
    if (tenantsMissing) return;
    if (mode === "all") onSave({ all: true, tenantIds: [] });
    else if (mode === "tenants") onSave({ all: false, tenantIds });
    else onSave({ all: false, tenantIds: [] });
  };

  const title =
    kind === "proxy"
      ? t("resource_sharing.title_proxy", { name: resourceName ?? "" })
      : count > 1
        ? t("resource_sharing.title_auth_batch", { count })
        : t("resource_sharing.title_auth", { name: resourceName ?? "" });

  const visibilityPoints =
    kind === "proxy"
      ? [
          t("resource_sharing.proxy_point_select"),
          t("resource_sharing.proxy_point_hidden"),
          t("resource_sharing.proxy_point_override"),
        ]
      : [
          t("resource_sharing.auth_point_schedule"),
          t("resource_sharing.auth_point_single_credential"),
          t("resource_sharing.auth_point_hidden"),
        ];

  return (
    <Modal
      open={open}
      title={title}
      description={t("resource_sharing.description")}
      icon={<Share2 />}
      size="md"
      onClose={onClose}
      footerStart={
        <span className="text-xs text-ink-3">{t("resource_sharing.applies_immediately")}</span>
      }
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {mixed ? (
          <Callout tone="warning">{t("resource_sharing.mixed_notice", { count })}</Callout>
        ) : null}

        <ChoiceCards
          value={mode}
          onChange={(next) => {
            setMode(next);
            setSubmitted(false);
          }}
          options={modeOptions}
          columns={1}
          ariaLabel={t("resource_sharing.mode_label")}
        />

        {mode === "tenants" ? (
          <FormField
            label={t("resource_sharing.tenants_label")}
            description={t("resource_sharing.tenants_hint")}
            error={tenantError}
          >
            <SearchableCheckboxMultiSelect
              value={tenantIds}
              onChange={(next) => {
                setTenantIds(next);
                setSubmitted(false);
              }}
              options={tenantOptions}
              placeholder={
                tenantsLoading
                  ? t("common.loading_ellipsis")
                  : t("resource_sharing.tenants_placeholder")
              }
              emptySelectionLabel={
                tenantsLoading
                  ? t("common.loading_ellipsis")
                  : t("resource_sharing.tenants_placeholder")
              }
              searchPlaceholder={t("resource_sharing.tenants_search")}
              selectFilteredLabel={t("resource_sharing.tenants_select_filtered")}
              deselectFilteredLabel={t("resource_sharing.tenants_deselect_filtered")}
              selectedCountLabel={(selected) =>
                t("resource_sharing.tenants_selected", { count: selected })
              }
              noResultsLabel={t("resource_sharing.tenants_no_results")}
              disabled={tenantsLoading && tenantOptions.length === 0}
            />
          </FormField>
        ) : null}

        {mode === "tenants" && tenantsError ? (
          <Callout tone="danger">
            {t("resource_sharing.tenants_load_failed", { message: tenantsError })}
          </Callout>
        ) : null}

        {mode !== "none" ? (
          <Callout tone="info" title={t("resource_sharing.visibility_title")}>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {visibilityPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        {mode !== "none" ? (
          <Callout tone="warning">
            {kind === "proxy"
              ? t("resource_sharing.proxy_change_warning")
              : t("resource_sharing.auth_change_warning")}
          </Callout>
        ) : value || mixed ? (
          // 从共享改回不共享：被授权租户立刻失去它，后果要在保存前讲清楚。
          <Callout tone="warning">
            {kind === "proxy"
              ? t("resource_sharing.proxy_revoke_warning")
              : t("resource_sharing.auth_revoke_warning")}
          </Callout>
        ) : null}
      </form>
    </Modal>
  );
}
