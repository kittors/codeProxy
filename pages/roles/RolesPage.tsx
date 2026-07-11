import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type PermissionIdentity, type RoleIdentity } from "@code-proxy/api-client";
import { TextInput, useToast } from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";

export function RolesPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const { can } = useAuth();
  const [roles, setRoles] = useState<RoleIdentity[]>([]);
  const [permissions, setPermissions] = useState<PermissionIdentity[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  const load = async (preferredId = selectedId) => {
    const [rolesResponse, permissionsResponse] = await Promise.all([
      identityApi.roles(),
      identityApi.permissions(),
    ]);
    const nextRoles = rolesResponse.items ?? [];
    setRoles(nextRoles);
    setPermissions(permissionsResponse.items ?? []);
    const nextRole = nextRoles.find((item) => item.id === preferredId) ?? nextRoles[0];
    setSelectedId(nextRole?.id ?? "");
    setSelected(new Set(nextRole?.permissions ?? []));
  };
  useEffect(() => void load(), []);

  const role = roles.find((item) => item.id === selectedId);
  const groups = useMemo(() => {
    const grouped = new Map<string, PermissionIdentity[]>();
    for (const item of permissions.filter(
      (permission) => permission.scope === "tenant" && can(permission.code),
    )) {
      grouped.set(item.resource, [...(grouped.get(item.resource) ?? []), item]);
    }
    return grouped;
  }, [can, permissions]);

  const run = async (action: () => Promise<unknown>, success: string, preferredId = selectedId) => {
    try {
      await action();
      await load(preferredId);
      notify({ type: "success", message: success });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    }
  };

  const createRole = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await identityApi.createRole({
        ...form,
        permissions: [],
      });
      setCreating(false);
      setForm({ code: "", name: "", description: "" });
      await load(created.id);
      notify({ type: "success", message: t("identity_admin.role_created") });
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.create_failed"),
      });
    }
  };

  return (
    <div className="space-y-4">
      <PermissionGate permission="tenant.roles.create">
        <div className="flex justify-end">
          <button
            onClick={() => setCreating((value) => !value)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white/10"
          >
            {t("identity_admin.new_role")}
          </button>
        </div>
      </PermissionGate>
      {creating ? (
        <form
          onSubmit={createRole}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <TextInput
            required
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            placeholder={t("identity_admin.role_code")}
          />
          <TextInput
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t("identity_admin.role_name")}
          />
          <TextInput
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={t("identity_admin.description")}
          />
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-3">
            {t("identity_admin.create_role")}
          </button>
        </form>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="px-3 py-2 text-lg font-semibold text-slate-950 dark:text-white">
            {t("identity_admin.roles")}
          </h2>
          {roles.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(item.id);
                setSelected(new Set(item.permissions));
              }}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm ${item.id === selectedId ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "text-slate-600 dark:text-slate-300"}`}
            >
              <div className="font-medium">{item.name}</div>
              <div className="text-xs opacity-60">
                {item.system_protected ? t("identity_admin.protected_role") : item.code}
              </div>
            </button>
          ))}
        </aside>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
                {role?.name ?? t("identity_admin.select_role")}
              </h2>
              <p className="text-sm text-slate-500">{role?.description}</p>
            </div>
            {role && !role.system_protected ? (
              <div className="flex gap-2">
                <PermissionGate permission="tenant.roles.delete">
                  <button
                    onClick={() => {
                      if (
                        window.confirm(t("identity_admin.delete_role_confirm", { name: role.name }))
                      )
                        void run(
                          () => identityApi.deleteRole(role.id),
                          t("identity_admin.role_deleted"),
                          "",
                        );
                    }}
                    className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
                  >
                    {t("identity_admin.delete")}
                  </button>
                </PermissionGate>
                <PermissionGate permission="tenant.roles.update">
                  <button
                    onClick={() =>
                      void run(
                        () =>
                          identityApi.replaceRolePermissions(role.id, [...selected], role.version),
                        t("identity_admin.role_permissions_saved"),
                      )
                    }
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white/10"
                  >
                    {t("identity_admin.save")}
                  </button>
                </PermissionGate>
              </div>
            ) : null}
          </div>
          <div className="mt-6 space-y-5">
            {[...groups].map(([resource, items]) => (
              <fieldset key={resource} disabled={role?.system_protected} className="space-y-2">
                <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {resource}
                </legend>
                {items.map((permission) => (
                  <label
                    key={permission.code}
                    className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 text-sm dark:border-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(permission.code)}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(permission.code);
                        else next.delete(permission.code);
                        setSelected(next);
                      }}
                    />
                    <span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {permission.name}
                      </span>
                      <span className="ml-2 text-xs text-slate-400">{permission.code}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
