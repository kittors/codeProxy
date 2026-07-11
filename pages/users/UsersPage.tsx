import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { identityApi, type RoleIdentity, type UserIdentity } from "@code-proxy/api-client";
import { TextInput, useToast } from "@code-proxy/ui";
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
    const usersResponse = await identityApi.users();
    setUsers(usersResponse.items ?? []);
    if (canReadRoles) {
      const rolesResponse = await identityApi.roles();
      setRoles(rolesResponse.items ?? []);
    } else {
      setRoles([]);
    }
  }, [canReadRoles]);
  useEffect(() => void load(), [load]);
  const assignableRoles = useMemo(
    () => roles.filter((role) => role.permissions.every((permission) => can(permission))),
    [can, roles],
  );

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
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
            {t("identity_admin.users_title")}
          </h2>
          <p className="text-sm text-slate-500">{t("identity_admin.users_description")}</p>
        </div>
        <PermissionGate permission="tenant.users.create">
          <button
            onClick={() => setOpen((value) => !value)}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white/10"
          >
            {t("identity_admin.new_user")}
          </button>
        </PermissionGate>
      </div>
      {open ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 dark:border-neutral-800 dark:bg-neutral-950"
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
              className="rounded-xl border border-slate-200 bg-transparent px-3 text-sm dark:border-neutral-700"
            >
              <option value="">{t("identity_admin.no_role")}</option>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          ) : null}
          <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white md:col-span-2">
            {t("identity_admin.create_user")}
          </button>
        </form>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-white/5">
            <tr>
              <th className="p-4">{t("identity_admin.user")}</th>
              <th>{t("identity_admin.status")}</th>
              <th>{t("identity_admin.roles")}</th>
              <th>{t("identity_admin.last_login")}</th>
              <th>{t("identity_admin.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const protectedUser = user.id === principal?.user.id || user.username === "admin";
              return (
                <tr key={user.id} className="border-t border-slate-100 dark:border-neutral-800">
                  <td className="p-4">
                    <div className="font-medium text-slate-900 dark:text-white">
                      {user.display_name}
                    </div>
                    <div className="text-xs text-slate-400">{user.username}</div>
                  </td>
                  <td>
                    <PermissionGate
                      permission="tenant.users.update"
                      fallback={<span>{user.status}</span>}
                    >
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
                        className="rounded-lg border border-slate-200 bg-transparent px-2 py-1 dark:border-neutral-700"
                      >
                        <option value="active">{t("identity_admin.status_active")}</option>
                        <option value="disabled">{t("identity_admin.status_disabled")}</option>
                        <option value="locked">{t("identity_admin.status_locked")}</option>
                      </select>
                    </PermissionGate>
                  </td>
                  <td>
                    {canAssignRoles && canReadRoles ? (
                      <select
                        multiple
                        disabled={protectedUser}
                        value={user.role_ids ?? []}
                        onChange={(event) => {
                          const ids = [...event.currentTarget.selectedOptions].map(
                            (option) => option.value,
                          );
                          void run(
                            () => identityApi.assignUserRoles(user.id, ids),
                            t("identity_admin.roles_updated"),
                          );
                        }}
                        className="min-h-20 rounded-lg border border-slate-200 bg-transparent px-2 py-1 dark:border-neutral-700"
                      >
                        {assignableRoles
                          .filter((role) => role.scope === "tenant")
                          .map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span>{user.role_codes?.join(", ") || "—"}</span>
                    )}
                  </td>
                  <td>
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString()
                      : t("identity_admin.never")}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <PermissionGate permission="tenant.users.reset_password">
                        <button
                          disabled={protectedUser}
                          onClick={() => {
                            const password = window.prompt(t("identity_admin.new_password_prompt"));
                            if (password)
                              void run(
                                () => identityApi.resetPassword(user.id, password),
                                t("identity_admin.password_reset"),
                              );
                          }}
                          className="rounded-lg border px-2 py-1 disabled:opacity-40"
                        >
                          {t("identity_admin.reset_password")}
                        </button>
                      </PermissionGate>
                      <PermissionGate permission="tenant.users.delete">
                        <button
                          disabled={protectedUser}
                          onClick={() => {
                            if (
                              window.confirm(
                                t("identity_admin.delete_user_confirm", {
                                  username: user.username,
                                }),
                              )
                            )
                              void run(
                                () => identityApi.deleteUser(user.id),
                                t("identity_admin.user_deleted"),
                              );
                          }}
                          className="rounded-lg border border-red-200 px-2 py-1 text-red-600 disabled:opacity-40"
                        >
                          {t("identity_admin.delete")}
                        </button>
                      </PermissionGate>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
