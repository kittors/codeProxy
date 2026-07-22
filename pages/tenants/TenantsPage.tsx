import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CalendarClock, Eye, Pencil } from "lucide-react";
import { identityApi, type TenantIdentity } from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  DataTable,
  DateTimePicker,
  Form,
  FormField,
  Modal,
  Select,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  Textarea,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import {
  isTenantNameTooLong,
  TENANT_NAME_MAX_LENGTH,
  toIsoDateTime,
  toLocalDateTimeInput,
} from "./tenantForm";

const emptyCreateForm = {
  name: "",
  expires_at: "",
  admin_username: "",
  admin_display_name: "",
  admin_password: "",
  description: "",
};

type CreateFormKey = keyof typeof emptyCreateForm;
type CreateFormErrors = Partial<Record<CreateFormKey, string>>;

export function TenantsPage() {
  const { notify } = useToast();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [items, setItems] = useState<TenantIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createErrors, setCreateErrors] = useState<CreateFormErrors>({});
  const [detailsTenant, setDetailsTenant] = useState<TenantIdentity | null>(null);
  const [editTenant, setEditTenant] = useState<TenantIdentity | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "active",
    access_token_ttl_seconds: 43200,
    refresh_token_ttl_seconds: 2592000,
  });
  const [renewTenant, setRenewTenant] = useState<TenantIdentity | null>(null);
  const [renewAt, setRenewAt] = useState("");
  const [renewError, setRenewError] = useState("");
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
    async (action: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await action();
        await load();
        notify({ type: "success", message: success });
        return true;
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
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
            <div className="truncate font-medium text-slate-900 dark:text-white">
              {tenantName(item)}
            </div>
            <div className="truncate text-xs text-slate-400">{item.slug}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: "w-32",
        render: (item) => (
          <span
            className={[
              "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
              item.effective_status === "active"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : item.effective_status === "expired"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
            ].join(" ")}
          >
            {statusLabel(item.effective_status)}
          </span>
        ),
      },
      {
        key: "expires",
        label: t("identity_admin.expires"),
        width: "w-52",
        render: (item) =>
          item.expires_at
            ? new Date(item.expires_at).toLocaleString(i18n.language)
            : t("identity_admin.never"),
      },
      {
        key: "version",
        label: t("identity_admin.version"),
        width: "w-24",
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
                  onClick: () => {
                    setEditTenant(item);
                    setEditForm({
                      name: item.name,
                      description: item.description ?? "",
                      status: item.status,
                      access_token_ttl_seconds: item.access_token_ttl_seconds ?? 43200,
                      refresh_token_ttl_seconds: item.refresh_token_ttl_seconds ?? 2592000,
                    });
                  },
                },
                {
                  key: "renew",
                  label: t("identity_admin.renew"),
                  icon: <CalendarClock size={14} />,
                  visible: canUpdateTenant,
                  onClick: () => {
                    setRenewTenant(item);
                    setRenewAt(toLocalDateTimeInput(item.expires_at));
                  },
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

  const updateCreateField = useCallback(
    <K extends CreateFormKey>(key: K, value: (typeof emptyCreateForm)[K]) => {
      setCreateForm((prev) => ({ ...prev, [key]: value }));
      setCreateErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [],
  );

  const validateCreateForm = useCallback((): CreateFormErrors => {
    const errors: CreateFormErrors = {};
    const requiredMsg = t("identity_admin.field_required");
    const nameTooLongMsg = t("identity_admin.name_too_long", { max: TENANT_NAME_MAX_LENGTH });

    if (!createForm.name.trim()) errors.name = requiredMsg;
    else if (isTenantNameTooLong(createForm.name)) errors.name = nameTooLongMsg;
    if (!createForm.admin_username.trim()) errors.admin_username = requiredMsg;
    if (!createForm.admin_display_name.trim()) errors.admin_display_name = requiredMsg;

    if (!createForm.admin_password) {
      errors.admin_password = requiredMsg;
    } else if (createForm.admin_password.length < 12) {
      errors.admin_password = t("identity_admin.password_requirement");
    }

    if (!createForm.expires_at.trim()) {
      errors.expires_at = t("identity_admin.expires_at_required");
    } else if (!toIsoDateTime(createForm.expires_at)) {
      errors.expires_at = t("identity_admin.expires_at_invalid");
    }

    return errors;
  }, [createForm, t]);

  const createTenant = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateCreateForm();
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      // Surface expiry issues as localized toast as well (DateTimePicker is easy to miss).
      if (errors.expires_at) {
        notify({ type: "error", message: errors.expires_at });
      }
      return;
    }

    const expiresAtIso = toIsoDateTime(createForm.expires_at);
    if (!expiresAtIso) {
      const message = t("identity_admin.expires_at_invalid");
      setCreateErrors({ expires_at: message });
      notify({ type: "error", message });
      return;
    }

    const success = await run(
      () =>
        identityApi.createTenant({
          ...createForm,
          expires_at: expiresAtIso,
        }),
      t("identity_admin.tenant_created"),
    );
    if (success) {
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
      setCreateErrors({});
    }
  };

  const saveTenant = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTenant) return;
    if (!editForm.name.trim()) {
      notify({ type: "error", message: t("identity_admin.field_required") });
      return;
    }
    if (isTenantNameTooLong(editForm.name)) {
      notify({
        type: "error",
        message: t("identity_admin.name_too_long", { max: TENANT_NAME_MAX_LENGTH }),
      });
      return;
    }
    const success = await run(
      () =>
        identityApi.updateTenant(editTenant.id, {
          name: editForm.name,
          description: editForm.description,
          status: editForm.status,
          access_token_ttl_seconds: editForm.access_token_ttl_seconds,
          refresh_token_ttl_seconds: editForm.refresh_token_ttl_seconds,
          version: editTenant.version,
        }),
      t("identity_admin.tenant_details_updated"),
    );
    if (success) setEditTenant(null);
  };

  const renew = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewTenant) return;

    if (!renewAt.trim()) {
      const message = t("identity_admin.expires_at_required");
      setRenewError(message);
      notify({ type: "error", message });
      return;
    }
    const expiresAtIso = toIsoDateTime(renewAt);
    if (!expiresAtIso) {
      const message = t("identity_admin.expires_at_invalid");
      setRenewError(message);
      notify({ type: "error", message });
      return;
    }

    const success = await run(
      () =>
        identityApi.updateTenant(renewTenant.id, {
          expires_at: expiresAtIso,
          version: renewTenant.version,
        }),
      t("identity_admin.tenant_expiry_updated"),
    );
    if (success) {
      setRenewTenant(null);
      setRenewError("");
    }
  };

  const closeCreateModal = () => {
    setCreateOpen(false);
    setCreateErrors({});
  };

  const closeRenewModal = () => {
    setRenewTenant(null);
    setRenewError("");
  };

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("identity_admin.tenants_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("identity_admin.tenants_description")}</p>
          </div>
          <PermissionGate permission="platform.tenants.create">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("identity_admin.new_tenant")}
            </Button>
          </PermissionGate>
        </div>

        <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
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

      <Modal
        open={createOpen}
        title={t("identity_admin.new_tenant")}
        description={t("identity_admin.tenants_description")}
        onClose={closeCreateModal}
        footer={
          <>
            <Button onClick={closeCreateModal}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-tenant-form" variant="primary" disabled={busy}>
              {t("identity_admin.create_tenant")}
            </Button>
          </>
        }
      >
        <Form id="create-tenant-form" onSubmit={createTenant} noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField label={t("identity_admin.name")} required error={createErrors.name}>
              <TextInput
                aria-label={t("identity_admin.name")}
                value={createForm.name}
                maxLength={TENANT_NAME_MAX_LENGTH}
                onChange={(event) => updateCreateField("name", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.expires_at")}
              required
              error={createErrors.expires_at}
            >
              <DateTimePicker
                value={createForm.expires_at}
                onChange={(value) => updateCreateField("expires_at", value)}
                aria-label={t("identity_admin.expires_at")}
                locale={i18n.language}
                labels={dateTimePickerLabels}
              />
            </FormField>
            <FormField
              label={t("identity_admin.admin_username")}
              required
              error={createErrors.admin_username}
            >
              <TextInput
                aria-label={t("identity_admin.admin_username")}
                value={createForm.admin_username}
                onChange={(event) => updateCreateField("admin_username", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.admin_display_name")}
              required
              error={createErrors.admin_display_name}
            >
              <TextInput
                aria-label={t("identity_admin.admin_display_name")}
                value={createForm.admin_display_name}
                onChange={(event) => updateCreateField("admin_display_name", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.admin_password")}
              required
              error={createErrors.admin_password}
              description={t("identity_admin.password_requirement")}
            >
              <TextInput
                aria-label={t("identity_admin.admin_password")}
                type="password"
                value={createForm.admin_password}
                onChange={(event) => updateCreateField("admin_password", event.target.value)}
                autoComplete="new-password"
              />
            </FormField>
            <FormField
              label={t("identity_admin.description")}
              error={createErrors.description}
              className="md:col-span-2"
            >
              <TextInput
                aria-label={t("identity_admin.description")}
                value={createForm.description}
                onChange={(event) => updateCreateField("description", event.target.value)}
              />
            </FormField>
          </div>
        </Form>
      </Modal>

      <Modal
        open={Boolean(detailsTenant)}
        title={detailsTenant ? tenantName(detailsTenant) : ""}
        onClose={() => setDetailsTenant(null)}
        maxWidth="max-w-xl"
      >
        {detailsTenant ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              [t("identity_admin.slug"), detailsTenant.slug],
              [t("identity_admin.status"), statusLabel(detailsTenant.effective_status)],
              [
                t("identity_admin.expires"),
                detailsTenant.expires_at
                  ? new Date(detailsTenant.expires_at).toLocaleString(i18n.language)
                  : t("identity_admin.never"),
              ],
              [t("identity_admin.version"), String(detailsTenant.version)],
              [
                t("identity_admin.description"),
                detailsTenant.description || t("identity_admin.none"),
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-white/5">
                <dt className="text-xs font-medium text-slate-400">{label}</dt>
                <dd className="mt-1 text-sm text-slate-800 dark:text-slate-200">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editTenant)}
        title={t("identity_admin.edit_tenant")}
        onClose={() => setEditTenant(null)}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setEditTenant(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="edit-tenant-form" variant="primary" disabled={busy}>
              {t("identity_admin.save")}
            </Button>
          </>
        }
      >
        <Form id="edit-tenant-form" onSubmit={saveTenant}>
          <FormField label={t("identity_admin.name")} required orientation="horizontal">
            <TextInput
              value={editForm.name}
              maxLength={TENANT_NAME_MAX_LENGTH}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              required
            />
          </FormField>
          <FormField label={t("identity_admin.status")} orientation="horizontal">
            <Select
              value={editForm.status}
              onChange={(status) => setEditForm({ ...editForm, status })}
              options={[
                { value: "active", label: t("identity_admin.status_active") },
                { value: "suspended", label: t("identity_admin.status_suspended") },
                { value: "disabled", label: t("identity_admin.status_disabled") },
              ]}
            />
          </FormField>
          <FormField label={t("identity_admin.description")} orientation="horizontal">
            <Textarea
              value={editForm.description}
              onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
            />
          </FormField>
          <FormField
            label={t("identity_admin.access_token_ttl", { defaultValue: "Access Token TTL (秒)" })}
            orientation="horizontal"
          >
            <TextInput
              type="number"
              min={60}
              value={String(editForm.access_token_ttl_seconds)}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  access_token_ttl_seconds: Number(event.target.value) || 43200,
                })
              }
            />
          </FormField>
          <FormField
            label={t("identity_admin.refresh_token_ttl", {
              defaultValue: "Refresh Token TTL (秒)",
            })}
            orientation="horizontal"
          >
            <TextInput
              type="number"
              min={300}
              value={String(editForm.refresh_token_ttl_seconds)}
              onChange={(event) =>
                setEditForm({
                  ...editForm,
                  refresh_token_ttl_seconds: Number(event.target.value) || 2592000,
                })
              }
            />
          </FormField>
        </Form>
      </Modal>

      <Modal
        open={Boolean(renewTenant)}
        title={t("identity_admin.renew_tenant")}
        onClose={closeRenewModal}
        maxWidth="max-w-md"
        footer={
          <>
            <Button onClick={closeRenewModal}>{t("common.cancel")}</Button>
            <Button type="submit" form="renew-tenant-form" variant="primary" disabled={busy}>
              {t("identity_admin.renew")}
            </Button>
          </>
        }
      >
        <Form id="renew-tenant-form" onSubmit={renew} noValidate>
          <FormField label={t("identity_admin.expires_at")} required error={renewError}>
            <DateTimePicker
              value={renewAt}
              onChange={(value) => {
                setRenewAt(value);
                if (renewError) setRenewError("");
              }}
              aria-label={t("identity_admin.expires_at")}
              locale={i18n.language}
              labels={dateTimePickerLabels}
            />
          </FormField>
        </Form>
      </Modal>

      <ConfirmModal
        open={Boolean(disableTenant)}
        title={t("identity_admin.disable")}
        description={
          disableTenant
            ? t("identity_admin.disable_tenant_confirm", { name: tenantName(disableTenant) })
            : ""
        }
        confirmText={t("identity_admin.disable")}
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
