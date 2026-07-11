import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Trash2 } from "lucide-react";
import { identityApi, type RoleIdentity, type UserIdentity } from "@code-proxy/api-client";
import {
  Button,
  DataTable,
  MultiSelect,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";

export function UsersPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const {
    state: { principal },
    can,
  } = useAuth();
  const [users, setUsers] = useState<UserIdentity[]>([]);
  const [roles, setRoles] = useState<RoleIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
    roleId: "",
  });
  const canReadRoles = can("tenant.roles.read");
  const canAssignRoles = can("tenant.users.assign_roles");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const usersResponse = await identityApi.users();
      setUsers(usersResponse.items ?? []);
      if (canReadRoles) {
        const rolesResponse = await identityApi.roles();
        setRoles(rolesResponse.items ?? []);
      } else {
        setRoles([]);
      }
    } finally {
      setLoading(false);
    }
  }, [canReadRoles]);

  useEffect(() => void load(), [load]);

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.permissions.every((permission) => can(permission))),
    [can, roles],
  );
  const roleNames = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);
  const assignableRoleOptions = useMemo(
    () =>
      assignableRoles
        .filter((role) => role.scope === "tenant")
        .map((role) => ({ value: role.id, label: role.name })),
    [assignableRoles],
  );

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

  const columns = useMemo<DataTableColumn<UserIdentity>[]>(
    () => [
      {
        key: "user",
        label: t("identity_admin.user"),
        width: "w-52",
        render: (user) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-white">
              {user.display_name}
            </div>
            <div className="truncate text-xs text-slate-400">{user.username}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: "w-32",
        render: (user) => {
          const protectedUser =
            user.id === principal?.user.id || user.role_codes?.includes("platform_super_admin");
          return (
            <PermissionGate permission="tenant.users.update" fallback={<span>{user.status}</span>}>
              <select
                disabled={protectedUser}
                value={user.status}
                onChange={(event) =>
                  void run(
                    () =>
                      identityApi.updateUser(user.id, {
                        status: event.target.value,
                        version: user.version,
                      }),
                    t("identity_admin.user_status_updated"),
                  )
                }
                className="h-10 rounded-xl border border-slate-200 bg-transparent px-3 text-sm disabled:opacity-60 dark:border-neutral-700"
              >
                <option value="active">{t("identity_admin.status_active")}</option>
                <option value="disabled">{t("identity_admin.status_disabled")}</option>
                <option value="locked">{t("identity_admin.status_locked")}</option>
              </select>
            </PermissionGate>
          );
        },
      },
      {
        key: "roles",
        label: t("identity_admin.roles"),
        width: "w-52",
        render: (user) => {
          const protectedUser =
            user.id === principal?.user.id || user.role_codes?.includes("platform_super_admin");
          const labels = (user.role_ids ?? []).map(
            (roleId, index) => roleNames.get(roleId) ?? user.role_codes?.[index] ?? roleId,
          );
          if (protectedUser || !canAssignRoles || !canReadRoles) {
            return <span>{labels.join(", ") || user.role_codes?.join(", ") || "—"}</span>;
          }
          return (
            <MultiSelect
              options={assignableRoleOptions}
              value={user.role_ids ?? []}
              onChange={(roleIds) =>
                void run(
                  () => identityApi.assignUserRoles(user.id, roleIds),
                  t("identity_admin.roles_updated"),
                )
              }
              emptyLabel={t("identity_admin.no_role")}
              selectAllLabel={t("identity_admin.no_role")}
              className="max-w-52"
            />
          );
        },
      },
      {
        key: "last-login",
        label: t("identity_admin.last_login"),
        width: "w-44",
        render: (user) =>
          user.last_login_at
            ? new Date(user.last_login_at).toLocaleString()
            : t("identity_admin.never"),
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        width: "w-24",
        lockOrder: "end",
        render: (user) => {
          const protectedUser =
            user.id === principal?.user.id || user.role_codes?.includes("platform_super_admin");
          return (
            <div className="flex gap-2">
              <PermissionGate permission="tenant.users.reset_password">
                <Button
                  size="xs"
                  disabled={protectedUser}
                  onClick={() => {
                    const password = window.prompt(t("identity_admin.new_password_prompt"));
                    if (password) {
                      void run(
                        () => identityApi.resetPassword(user.id, password),
                        t("identity_admin.password_reset"),
                      );
                    }
                  }}
                  tooltip={t("identity_admin.reset_password")}
                >
                  <KeyRound size={14} />
                </Button>
              </PermissionGate>
              <PermissionGate permission="tenant.users.delete">
                <Button
                  size="xs"
                  variant="error"
                  disabled={protectedUser}
                  onClick={() => {
                    if (
                      window.confirm(
                        t("identity_admin.delete_user_confirm", { username: user.username }),
                      )
                    ) {
                      void run(
                        () => identityApi.deleteUser(user.id),
                        t("identity_admin.user_deleted"),
                      );
                    }
                  }}
                  tooltip={t("identity_admin.delete")}
                >
                  <Trash2 size={14} />
                </Button>
              </PermissionGate>
            </div>
          );
        },
      },
    ],
    [assignableRoleOptions, canAssignRoles, canReadRoles, principal?.user.id, roleNames, run, t],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await run(
      () =>
        identityApi.createUser({
          username: form.username,
          display_name: form.displayName,
          password: form.password,
          role_ids: canAssignRoles && form.roleId ? [form.roleId] : [],
        }),
      t("identity_admin.user_created"),
    );
    setOpen(false);
  };

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("identity_admin.users_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("identity_admin.users_description")}</p>
          </div>
          <PermissionGate permission="tenant.users.create">
            <Button variant="primary" onClick={() => setOpen((value) => !value)}>
              {t("identity_admin.new_user")}
            </Button>
          </PermissionGate>
        </div>

        {open ? (
          <form
            onSubmit={submit}
            className="mx-5 mb-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2 dark:bg-white/5"
          >
            <TextInput
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              placeholder={t("identity_admin.username")}
              required
            />
            <TextInput
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              placeholder={t("identity_admin.display_name")}
              required
            />
            <TextInput
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder={t("identity_admin.initial_password")}
              required
              minLength={12}
            />
            {canAssignRoles && canReadRoles ? (
              <select
                value={form.roleId}
                onChange={(event) => setForm({ ...form, roleId: event.target.value })}
                className="h-11 rounded-2xl border border-black/[0.04] bg-white px-3.5 text-sm text-slate-700 shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] dark:border-transparent dark:bg-[#27272A] dark:text-slate-200"
              >
                <option value="">{t("identity_admin.no_role")}</option>
                {assignableRoles
                  .filter((role) => role.scope === "tenant")
                  .map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
              </select>
            ) : null}
            <Button type="submit" variant="primary" className="md:col-span-2">
              {t("identity_admin.create_user")}
            </Button>
          </form>
        ) : null}

        <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
          <DataTable<UserIdentity>
            tableId="identity-users"
            rows={users}
            columns={columns}
            rowKey={(user) => user.id}
            loading={loading}
            virtualize={false}
            rowHeight={56}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[820px]"
            emptyText={t("identity_admin.no_users")}
            showAllLoadedMessage={false}
          />
        </div>
      </div>
    </section>
  );
}
