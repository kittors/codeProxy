import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type PermissionIdentity, type RoleIdentity } from "@code-proxy/api-client";
import { Button, DataTable, TextInput, type DataTableColumn, useToast } from "@code-proxy/ui";
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
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", description: "" });

  const load = useCallback(async (preferredId = "") => {
    setLoading(true);
    try {
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const role = roles.find((item) => item.id === selectedId);
  const groups = useMemo(() => {
    const grouped = new Map<string, PermissionIdentity[]>();
    for (const item of permissions.filter(
      (permission) =>
        can(permission.code) && (role?.scope === "platform" || permission.scope === "tenant"),
    )) {
      grouped.set(item.resource, [...(grouped.get(item.resource) ?? []), item]);
    }
    return grouped;
  }, [can, permissions, role?.scope]);

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

  const columns = useMemo<DataTableColumn<RoleIdentity>[]>(
    () => [
      {
        key: "role",
        label: t("identity_admin.roles"),
        render: (item) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-white">{item.name}</div>
            <div className="truncate text-xs text-slate-400">{item.code}</div>
          </div>
        ),
      },
      {
        key: "scope",
        label: t("identity_admin.scope"),
        width: "w-28",
        render: (item) => (
          <span className="text-xs text-slate-500">
            {item.system_protected ? t("identity_admin.protected_role") : item.scope}
          </span>
        ),
      },
    ],
    [t],
  );

  const createRole = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await identityApi.createRole({ ...form, permissions: [] });
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
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("identity_admin.roles_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("identity_admin.roles_description")}</p>
          </div>
          <PermissionGate permission="tenant.roles.create">
            <Button variant="primary" onClick={() => setCreating((value) => !value)}>
              {t("identity_admin.new_role")}
            </Button>
          </PermissionGate>
        </div>

        {creating ? (
          <form
            onSubmit={createRole}
            className="mx-5 mb-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-3 dark:bg-white/5"
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
            <Button type="submit" variant="primary" className="md:col-span-3">
              {t("identity_admin.create_role")}
            </Button>
          </form>
        ) : null}

        <div className="grid h-[calc(100dvh-250px)] min-h-[420px] gap-5 overflow-hidden px-5 pb-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <DataTable<RoleIdentity>
            tableId="identity-roles"
            rows={roles}
            columns={columns}
            rowKey={(item) => item.id}
            loading={loading}
            virtualize={false}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-full"
            emptyText={t("identity_admin.no_roles")}
            showAllLoadedMessage={false}
            columnResizable={false}
            columnReorderable={false}
            onRowClick={(item) => {
              setSelectedId(item.id);
              setSelected(new Set(item.permissions));
            }}
            rowAriaSelected={(item) => item.id === selectedId}
            rowClassName={(item) =>
              item.id === selectedId
                ? "bg-blue-50/70 dark:bg-blue-500/10"
                : "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
            }
          />

          <div className="min-h-0 overflow-y-auto rounded-xl bg-slate-50/70 p-5 dark:bg-white/[0.035]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-950 dark:text-white">
                  {role?.name ?? t("identity_admin.select_role")}
                </h3>
                <p className="text-sm text-slate-500">{role?.description}</p>
              </div>
              {role && !role.system_protected ? (
                <div className="flex gap-2">
                  <PermissionGate permission="tenant.roles.delete">
                    <Button
                      variant="error"
                      onClick={() => {
                        if (
                          window.confirm(
                            t("identity_admin.delete_role_confirm", { name: role.name }),
                          )
                        ) {
                          void run(
                            () => identityApi.deleteRole(role.id),
                            t("identity_admin.role_deleted"),
                            "",
                          );
                        }
                      }}
                    >
                      {t("identity_admin.delete")}
                    </Button>
                  </PermissionGate>
                  <PermissionGate permission="tenant.roles.update">
                    <Button
                      variant="primary"
                      onClick={() =>
                        void run(
                          () =>
                            identityApi.replaceRolePermissions(
                              role.id,
                              [...selected],
                              role.version,
                            ),
                          t("identity_admin.role_permissions_saved"),
                        )
                      }
                    >
                      {t("identity_admin.save")}
                    </Button>
                  </PermissionGate>
                </div>
              ) : null}
            </div>

            <div className="mt-6 space-y-5">
              {[...groups].map(([resource, items]) => (
                <fieldset
                  key={resource}
                  disabled={!role || role.system_protected}
                  className="space-y-2"
                >
                  <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {resource}
                  </legend>
                  {items.map((permission) => (
                    <label
                      key={permission.code}
                      className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-white p-3 text-sm dark:border-white/[0.06] dark:bg-neutral-950/55"
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
          </div>
        </div>
      </div>
    </section>
  );
}
