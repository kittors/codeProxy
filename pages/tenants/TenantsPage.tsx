import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type TenantIdentity } from "@code-proxy/api-client";
import { TextInput, useToast } from "@code-proxy/ui";
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
  const load = async () => {
    setLoading(true);
    try {
      setItems((await identityApi.tenants()).items ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const run = async (action: () => Promise<unknown>, success: string) => {
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
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
            {t("identity_admin.tenants_title")}
          </h2>
          <p className="text-sm text-slate-500">{t("identity_admin.tenants_description")}</p>
        </div>
        <PermissionGate permission="platform.tenants.create">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white/10"
          >
            {t("identity_admin.new_tenant")}
          </button>
        </PermissionGate>
      </div>
      {open ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-950"
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
            <label key={key} className="space-y-1 text-xs text-slate-500">
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
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={key !== "description"}
                minLength={key === "admin_password" ? 12 : undefined}
              />
            </label>
          ))}
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
            {t("identity_admin.create_tenant")}
          </button>
        </form>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        {loading ? (
          <div className="p-6 text-sm text-slate-500">{t("identity_admin.loading")}</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5">
              <tr>
                <th className="p-4">{t("identity_admin.tenant")}</th>
                <th>{t("identity_admin.status")}</th>
                <th>{t("identity_admin.expires")}</th>
                <th>{t("identity_admin.version")}</th>
                <th>{t("identity_admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-neutral-800">
                  <td className="p-4">
                    <div className="font-medium text-slate-900 dark:text-white">{item.name}</div>
                    <div className="text-xs text-slate-400">{item.slug}</div>
                  </td>
                  <td>
                    {item.type === "system" ? (
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
                          className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 dark:border-neutral-700"
                        >
                          <option value="active">{t("identity_admin.status_active")}</option>
                          <option value="suspended">{t("identity_admin.status_suspended")}</option>
                          <option value="disabled">{t("identity_admin.status_disabled")}</option>
                        </select>
                      </PermissionGate>
                    )}
                  </td>
                  <td>
                    {item.expires_at
                      ? new Date(item.expires_at).toLocaleString()
                      : t("identity_admin.never")}
                  </td>
                  <td>{item.version}</td>
                  <td>
                    {item.type === "system" ? null : (
                      <PermissionGate permission="platform.tenants.update">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              const name = window.prompt(
                                t("identity_admin.tenant_name_prompt"),
                                item.name,
                              );
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
                            className="rounded-lg border px-2 py-1"
                          >
                            {t("identity_admin.edit")}
                          </button>
                          <button
                            onClick={() => {
                              const value = window.prompt(
                                t("identity_admin.new_expiry_prompt"),
                                item.expires_at ? item.expires_at.slice(0, 16) : "",
                              );
                              if (value)
                                void run(
                                  () =>
                                    identityApi.updateTenant(item.id, {
                                      expires_at: new Date(value).toISOString(),
                                      version: item.version,
                                    }),
                                  t("identity_admin.tenant_expiry_updated"),
                                );
                            }}
                            className="rounded-lg border px-2 py-1"
                          >
                            {t("identity_admin.renew")}
                          </button>
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  t("identity_admin.disable_tenant_confirm", { name: item.name }),
                                )
                              )
                                void run(
                                  () => identityApi.deleteTenant(item.id, item.version),
                                  t("identity_admin.tenant_disabled"),
                                );
                            }}
                            className="rounded-lg border border-red-200 px-2 py-1 text-red-600"
                          >
                            {t("identity_admin.disable")}
                          </button>
                        </div>
                      </PermissionGate>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
