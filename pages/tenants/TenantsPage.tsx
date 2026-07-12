import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type TenantIdentity } from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  DataTable,
  Modal,
  Select,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";

const emptyCreateForm = {
  slug: "",
  name: "",
  expires_at: "",
  admin_username: "",
  admin_display_name: "",
  admin_password: "",
  description: "",
};

const toLocalDateTimeInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export function TenantsPage() {
  const { notify } = useToast();
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<TenantIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [detailsTenant, setDetailsTenant] = useState<TenantIdentity | null>(null);
  const [editTenant, setEditTenant] = useState<TenantIdentity | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", status: "active" });
  const [renewTenant, setRenewTenant] = useState<TenantIdentity | null>(null);
  const [renewAt, setRenewAt] = useState("");
  const [disableTenant, setDisableTenant] = useState<TenantIdentity | null>(null);
  const [busy, setBusy] = useState(false);

  const tenantName = useCallback(
    (tenant: TenantIdentity) => (tenant.type === "system" ? t("shell.system_tenant") : tenant.name),
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
        minWidthPx: 280,
        width: "w-64",
        lockOrder: "end",
        render: (item) => (
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => setDetailsTenant(item)}>
              {t("identity_admin.view")}
            </Button>
            {item.type !== "system" ? (
              <PermissionGate permission="platform.tenants.update">
                <Button
                  size="xs"
                  onClick={() => {
                    setEditTenant(item);
                    setEditForm({
                      name: item.name,
                      description: item.description ?? "",
                      status: item.status,
                    });
                  }}
                >
                  {t("identity_admin.edit")}
                </Button>
                <Button
                  size="xs"
                  onClick={() => {
                    setRenewTenant(item);
                    setRenewAt(toLocalDateTimeInput(item.expires_at));
                  }}
                >
                  {t("identity_admin.renew")}
                </Button>
                <Button size="xs" variant="error" onClick={() => setDisableTenant(item)}>
                  {t("identity_admin.disable")}
                </Button>
              </PermissionGate>
            ) : null}
          </div>
        ),
      },
    ],
    [i18n.language, statusLabel, t, tenantName],
  );

  const createTenant = async (event: FormEvent) => {
    event.preventDefault();
    const success = await run(
      () =>
        identityApi.createTenant({
          ...createForm,
          expires_at: new Date(createForm.expires_at).toISOString(),
        }),
      t("identity_admin.tenant_created"),
    );
    if (success) {
      setCreateOpen(false);
      setCreateForm(emptyCreateForm);
    }
  };

  const saveTenant = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTenant) return;
    const success = await run(
      () =>
        identityApi.updateTenant(editTenant.id, {
          name: editForm.name,
          description: editForm.description,
          status: editForm.status,
          version: editTenant.version,
        }),
      t("identity_admin.tenant_details_updated"),
    );
    if (success) setEditTenant(null);
  };

  const renew = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewTenant || !renewAt) return;
    const success = await run(
      () =>
        identityApi.updateTenant(renewTenant.id, {
          expires_at: new Date(renewAt).toISOString(),
          version: renewTenant.version,
        }),
      t("identity_admin.tenant_expiry_updated"),
    );
    if (success) setRenewTenant(null);
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
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-tenant-form" variant="primary" disabled={busy}>
              {t("identity_admin.create_tenant")}
            </Button>
          </>
        }
      >
        <form id="create-tenant-form" onSubmit={createTenant} className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["slug", t("identity_admin.slug")],
              ["name", t("identity_admin.name")],
              ["expires_at", t("identity_admin.expires_at")],
              ["admin_username", t("identity_admin.admin_username")],
              ["admin_display_name", t("identity_admin.admin_display_name")],
              ["admin_password", t("identity_admin.admin_password")],
              ["description", t("identity_admin.description")],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className={key === "description" ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}
            >
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {label}
              </span>
              <TextInput
                aria-label={label}
                type={
                  key === "admin_password"
                    ? "password"
                    : key === "expires_at"
                      ? "datetime-local"
                      : "text"
                }
                value={createForm[key]}
                onChange={(event) => setCreateForm({ ...createForm, [key]: event.target.value })}
                required={key !== "description"}
                minLength={key === "admin_password" ? 12 : undefined}
              />
            </label>
          ))}
        </form>
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
        <form id="edit-tenant-form" onSubmit={saveTenant} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.name")}
            </span>
            <TextInput
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.status")}
            </span>
            <Select
              value={editForm.status}
              onChange={(status) => setEditForm({ ...editForm, status })}
              options={[
                { value: "active", label: t("identity_admin.status_active") },
                { value: "suspended", label: t("identity_admin.status_suspended") },
                { value: "disabled", label: t("identity_admin.status_disabled") },
              ]}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.description")}
            </span>
            <textarea
              value={editForm.description}
              onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
              className="min-h-28 w-full rounded-2xl border border-black/[0.04] bg-white px-3.5 py-3 text-sm text-slate-700 outline-none shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] focus:ring-2 focus:ring-slate-300/50 dark:border-transparent dark:bg-[#27272A] dark:text-slate-200"
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(renewTenant)}
        title={t("identity_admin.renew_tenant")}
        onClose={() => setRenewTenant(null)}
        maxWidth="max-w-md"
        footer={
          <>
            <Button onClick={() => setRenewTenant(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="renew-tenant-form" variant="primary" disabled={busy}>
              {t("identity_admin.renew")}
            </Button>
          </>
        }
      >
        <form id="renew-tenant-form" onSubmit={renew} className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.expires_at")}
            </span>
            <TextInput
              type="datetime-local"
              value={renewAt}
              onChange={(event) => setRenewAt(event.target.value)}
              required
            />
          </label>
        </form>
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
