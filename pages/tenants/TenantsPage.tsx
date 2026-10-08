import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CalendarClock, Eye, Pencil } from "lucide-react";
import { identityApi, type TenantIdentity } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { resolvePasswordApiError } from "@features/password-policy";
import { CreateTenantModal, type CreateTenantForm } from "./CreateTenantModal";
import { EditTenantModal, type EditTenantValues } from "./EditTenantModal";
import { DisableTenantConfirm, RenewTenantModal, TenantDetailsModal } from "./TenantDialogs";
import { toIsoDateTime } from "./tenantForm";

export function TenantsPage() {
  const { notify } = useToast();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [items, setItems] = useState<TenantIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailsTenant, setDetailsTenant] = useState<TenantIdentity | null>(null);
  const [editTenant, setEditTenant] = useState<TenantIdentity | null>(null);
  const [renewTenant, setRenewTenant] = useState<TenantIdentity | null>(null);
  const [disableTenant, setDisableTenant] = useState<TenantIdentity | null>(null);
  const [busy, setBusy] = useState(false);

  const tenantName = useCallback(
    (tenant: TenantIdentity) => (tenant.type === "system" ? t("shell.system_tenant") : tenant.name),
    [t],
  );

  // ponytail: reuse auth_files picker labels; promote to common.* if more pages need them
  const dateTimePickerLabels = useMemo(
    () => ({
      picker: t("auth_files.subscription_date_picker"),
      open: t("auth_files.subscription_date_picker_open"),
      previousMonth: t("auth_files.subscription_date_picker_previous_month"),
      nextMonth: t("auth_files.subscription_date_picker_next_month"),
      today: t("auth_files.subscription_date_picker_today"),
      clear: t("auth_files.subscription_date_picker_clear"),
      hour: t("auth_files.subscription_date_picker_hour"),
      minute: t("auth_files.subscription_date_picker_minute"),
    }),
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await identityApi.tenants()).items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      success: string,
      // Lets a caller translate a failure it recognises. Without it every
      // rejection fell through to error.message, which is the server's English
      // text — the reason a bad tenant admin password surfaced as an English
      // toast even though the panel had the translations for it.
      resolveError?: (error: unknown) => string | null,
    ) => {
      setBusy(true);
      try {
        await action();
        await load();
        notify({ type: "success", message: success });
        return true;
      } catch (error) {
        const resolved = resolveError?.(error) ?? null;
        notify({
          type: "error",
          message:
            resolved ??
            (error instanceof Error ? error.message : t("identity_admin.operation_failed")),
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const statusLabel = useCallback(
    (status: TenantIdentity["effective_status"]) =>
      t(
        status === "active"
          ? "identity_admin.status_active"
          : status === "expired"
            ? "identity_admin.status_expired"
            : status === "suspended"
              ? "identity_admin.status_suspended"
              : "identity_admin.status_disabled",
      ),
    [t],
  );

  const columns = useMemo<DataTableColumn<TenantIdentity>[]>(
    () => [
      {
        key: "tenant",
        label: t("identity_admin.tenant"),
        width: "w-64",
        render: (item) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{tenantName(item)}</div>
            <div className="truncate text-xs text-ink-3">{item.slug}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: COLUMN_WIDTH.compact,
        render: (item) => (
          <span
            className={[
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
              item.effective_status === "active"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : item.effective_status === "expired"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-rose-500/10 text-rose-700 dark:text-rose-300",
            ].join(" ")}
          >
            {statusLabel(item.effective_status)}
          </span>
        ),
      },
      {
        key: "expires",
        label: t("identity_admin.expires"),
        width: COLUMN_WIDTH.timestamp,
        render: (item) =>
          item.expires_at
            ? new Date(item.expires_at).toLocaleString(i18n.language)
            : t("identity_admin.never"),
      },
      {
        key: "version",
        label: t("identity_admin.version"),
        width: COLUMN_WIDTH.badge,
        render: (item) => item.version,
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        render: (item) => {
          const canUpdateTenant = item.type !== "system" && can("platform.tenants.update");
          return (
            <TableRowActions
              moreLabel={t("common.more_actions")}
              align="start"
              actions={[
                {
                  key: "view",
                  label: t("identity_admin.view"),
                  icon: <Eye size={14} />,
                  onClick: () => setDetailsTenant(item),
                },
                {
                  key: "edit",
                  label: t("identity_admin.edit"),
                  icon: <Pencil size={14} />,
                  visible: canUpdateTenant,
                  onClick: () => setEditTenant(item),
                },
                {
                  key: "renew",
                  label: t("identity_admin.renew"),
                  icon: <CalendarClock size={14} />,
                  visible: canUpdateTenant,
                  onClick: () => setRenewTenant(item),
                },
                {
                  key: "disable",
                  label: t("identity_admin.disable"),
                  icon: <Ban size={14} />,
                  visible: canUpdateTenant,
                  destructive: true,
                  onClick: () => setDisableTenant(item),
                },
              ]}
            />
          );
        },
      },
    ],
    [can, i18n.language, statusLabel, t, tenantName],
  );

  /** 创建成功返回 null；服务端拒绝管理员密码时返回该错误，由弹窗显示在密码框下。 */
  const createTenant = async (form: CreateTenantForm): Promise<string | null> => {
    const expiresAtIso = toIsoDateTime(form.expires_at);
    if (!expiresAtIso) return null; // 弹窗已按同一规则拦下，这里只为类型收窄。
    let policyError: string | null = null;
    const success = await run(
      () =>
        identityApi.createTenant({
          ...form,
          expires_at: expiresAtIso,
        }),
      t("identity_admin.tenant_created"),
      (error) => {
        // A server-side password rejection belongs under the field, exactly
        // where the local check would have put it.
        policyError = resolvePasswordApiError(error, t);
        return policyError;
      },
    );
    if (success) setCreateOpen(false);
    return policyError;
  };

  const saveTenant = async (values: EditTenantValues) => {
    if (!editTenant) return;
    const success = await run(
      () =>
        identityApi.updateTenant(editTenant.id, {
          ...values,
          version: editTenant.version,
        }),
      t("identity_admin.tenant_details_updated"),
    );
    if (success) setEditTenant(null);
  };

  const renew = async (expiresAtIso: string) => {
    if (!renewTenant) return;
    const success = await run(
      () =>
        identityApi.updateTenant(renewTenant.id, {
          expires_at: expiresAtIso,
          version: renewTenant.version,
        }),
      t("identity_admin.tenant_expiry_updated"),
    );
    if (success) setRenewTenant(null);
  };

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      {/* 不再包一层卡片：外壳内容区就是这一页的面板，标题和表格直接落在上面（同请求日志页）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t("identity_admin.tenants_title")}</h2>
            <p className="text-sm text-ink-3">{t("identity_admin.tenants_description")}</p>
          </div>
          <PermissionGate permission="platform.tenants.create">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("identity_admin.new_tenant")}
            </Button>
          </PermissionGate>
        </div>

        {/* 表格吃掉页面剩余高度、内部滚动；不设最小高度保底——页面高度被窗口钉死，保底只会在矮窗口下把表格挤出页面（见请求日志页）。 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DataTable<TenantIdentity>
            tableId="identity-tenants"
            rows={items}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            virtualize={false}
            rowHeight={60}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[980px]"
            emptyText={t("identity_admin.no_tenants")}
            showAllLoadedMessage={false}
          />
        </div>
      </div>

      <CreateTenantModal
        open={createOpen}
        busy={busy}
        locale={i18n.language}
        dateTimePickerLabels={dateTimePickerLabels}
        onSubmit={createTenant}
        onClose={() => setCreateOpen(false)}
      />

      <TenantDetailsModal
        tenant={detailsTenant}
        name={detailsTenant ? tenantName(detailsTenant) : ""}
        statusLabel={statusLabel}
        locale={i18n.language}
        onClose={() => setDetailsTenant(null)}
      />

      <EditTenantModal
        tenant={editTenant}
        busy={busy}
        locale={i18n.language}
        onSubmit={(values) => void saveTenant(values)}
        onClose={() => setEditTenant(null)}
      />

      <RenewTenantModal
        tenant={renewTenant}
        name={renewTenant ? tenantName(renewTenant) : ""}
        busy={busy}
        locale={i18n.language}
        dateTimePickerLabels={dateTimePickerLabels}
        onSubmit={(iso) => void renew(iso)}
        onClose={() => setRenewTenant(null)}
      />

      <DisableTenantConfirm
        tenant={disableTenant}
        name={disableTenant ? tenantName(disableTenant) : ""}
        busy={busy}
        onClose={() => setDisableTenant(null)}
        onConfirm={() => {
          if (!disableTenant) return;
          void run(
            () => identityApi.deleteTenant(disableTenant.id, disableTenant.version),
            t("identity_admin.tenant_disabled"),
          ).then((success) => {
            if (success) setDisableTenant(null);
          });
        }}
      />
    </section>
  );
}
