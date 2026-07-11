import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type TenantIdentity } from "@code-proxy/api-client";
import { Button, DataTable, TextInput, type DataTableColumn, useToast } from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";

export function TenantsPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const [items, setItems] = useState<TenantIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    name: "",
    expires_at: "",
    admin_username: "",
    admin_display_name: "",
    admin_password: "",
    description: "",
  });

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
      try {
        await action();
        await load();
        notify({ type: "success", message: success });
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
        });
      }
    },
    [load, notify, t],
  );

  const columns = useMemo<DataTableColumn<TenantIdentity>[]>(
    () => [
      {
        key: "tenant",
        label: t("identity_admin.tenant"),
        width: "w-64",
        render: (item) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-white">{item.name}</div>
            <div className="truncate text-xs text-slate-400">{item.slug}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: "w-40",
        render: (item) =>
          item.type === "system" ? (
            item.effective_status
          ) : (
            <PermissionGate
              permission="platform.tenants.update"
              fallback={<span>{item.effective_status}</span>}
            >
              <select
                value={item.status}
                onChange={(event) =>
                  void run(
                    () =>
                      identityApi.updateTenant(item.id, {
                        status: event.target.value,
                        version: item.version,
                      }),
                    t("identity_admin.tenant_status_updated"),
                  )
                }
                className="h-10 rounded-xl border border-slate-200 bg-transparent px-3 text-sm dark:border-neutral-700"
              >
                <option value="active">{t("identity_admin.status_active")}</option>
                <option value="suspended">{t("identity_admin.status_suspended")}</option>
                <option value="disabled">{t("identity_admin.status_disabled")}</option>
              </select>
            </PermissionGate>
          ),
      },
      {
        key: "expires",
        label: t("identity_admin.expires"),
        width: "w-52",
        render: (item) =>
          item.expires_at ? new Date(item.expires_at).toLocaleString() : t("identity_admin.never"),
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
        width: "w-64",
        lockOrder: "end",
        render: (item) =>
          item.type === "system" ? null : (
            <PermissionGate permission="platform.tenants.update">
              <div className="flex gap-2">
                <Button
                  size="xs"
                  onClick={() => {
                    const name = window.prompt(t("identity_admin.tenant_name_prompt"), item.name);
                    if (name === null) return;
                    const description = window.prompt(
                      t("identity_admin.tenant_description_prompt"),
                      item.description ?? "",
                    );
                    if (description === null) return;
                    void run(
                      () =>
                        identityApi.updateTenant(item.id, {
                          name,
                          description,
                          version: item.version,
                        }),
                      t("identity_admin.tenant_details_updated"),
                    );
                  }}
                >
                  {t("identity_admin.edit")}
                </Button>
                <Button
                  size="xs"
                  onClick={() => {
                    const value = window.prompt(
                      t("identity_admin.new_expiry_prompt"),
                      item.expires_at ? item.expires_at.slice(0, 16) : "",
                    );
                    if (value) {
                      void run(
                        () =>
                          identityApi.updateTenant(item.id, {
                            expires_at: new Date(value).toISOString(),
                            version: item.version,
                          }),
                        t("identity_admin.tenant_expiry_updated"),
                      );
                    }
                  }}
                >
                  {t("identity_admin.renew")}
                </Button>
                <Button
                  size="xs"
                  variant="error"
                  onClick={() => {
                    if (
                      window.confirm(
                        t("identity_admin.disable_tenant_confirm", { name: item.name }),
                      )
                    ) {
                      void run(
                        () => identityApi.deleteTenant(item.id, item.version),
                        t("identity_admin.tenant_disabled"),
                      );
                    }
                  }}
                >
                  {t("identity_admin.disable")}
                </Button>
              </div>
            </PermissionGate>
          ),
      },
    ],
    [run, t],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await identityApi.createTenant({
        ...form,
        expires_at: new Date(form.expires_at).toISOString(),
      });
      setOpen(false);
      await load();
      notify({ type: "success", message: t("identity_admin.tenant_created") });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.create_failed"),
      });
    }
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
            <Button variant="primary" onClick={() => setOpen((value) => !value)}>
              {t("identity_admin.new_tenant")}
            </Button>
          </PermissionGate>
        </div>

        {open ? (
          <form
            onSubmit={submit}
            className="mx-5 mb-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-white/5"
          >
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
              <label key={key} className="space-y-1.5 text-xs text-slate-500">
                <span>{label}</span>
                <TextInput
                  type={
                    key === "admin_password"
                      ? "password"
                      : key === "expires_at"
                        ? "datetime-local"
                        : "text"
                  }
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  required={key !== "description"}
                  minLength={key === "admin_password" ? 12 : undefined}
                />
              </label>
            ))}
            <Button type="submit" variant="primary" className="md:col-span-2">
              {t("identity_admin.create_tenant")}
            </Button>
          </form>
        ) : null}

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
    </section>
  );
}
