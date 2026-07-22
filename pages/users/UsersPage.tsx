import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Trash2 } from "lucide-react";
import { identityApi, type RoleIdentity, type UserIdentity } from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  DataTable,
  Modal,
  MultiSelect,
  TABLE_ROW_ACTIONS_COLUMN,
  TextInput,
  ToggleSwitch,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";

const emptyForm = { username: "", displayName: "", password: "", roleIds: [] as string[] };

export function UsersPage() {
  const { notify } = useToast();
  const { t, i18n } = useTranslation();
  const {
    state: { principal },
    can,
  } = useAuth();
  const [users, setUsers] = useState<UserIdentity[]>([]);
  const [roles, setRoles] = useState<RoleIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [resetUser, setResetUser] = useState<UserIdentity | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [deleteUser, setDeleteUser] = useState<UserIdentity | null>(null);
  const [disableUser, setDisableUser] = useState<UserIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const canReadRoles = can("tenant.roles.read");
  const canAssignRoles = can("tenant.users.assign_roles");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const usersResponse = await identityApi.users();
      setUsers(usersResponse.items ?? []);
      if (canReadRoles) {
        setRoles((await identityApi.roles()).items ?? []);
      } else {
        setRoles([]);
      }
    } finally {
      setLoading(false);
    }
  }, [canReadRoles]);

  useEffect(() => void load(), [load]);

  const assignableRoles = useMemo(
    () =>
      roles.filter(
        (role) =>
          role.scope === "tenant" && role.permissions.every((permission) => can(permission)),
      ),
    [can, roles],
  );
  const roleNames = useMemo(
    () =>
      new Map(
        roles.map((role) => [
          role.id,
          role.code === "platform_super_admin"
            ? t("identity_admin.administrator_role")
            : role.code === "tenant_admin"
              ? t("identity_admin.tenant_administrator_role")
              : role.name,
        ]),
      ),
    [roles, t],
  );
  const roleOptions = useMemo(
    () =>
      assignableRoles.map((role) => ({
        value: role.id,
        label: roleNames.get(role.id) ?? role.name,
      })),
    [assignableRoles, roleNames],
  );

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

  const userName = useCallback(
    (user: UserIdentity) =>
      user.role_codes?.includes("platform_super_admin")
        ? t("identity_admin.super_administrator")
        : user.display_name,
    [t],
  );

  const isProtected = useCallback(
    (user: UserIdentity) =>
      user.id === principal?.user.id || user.role_codes?.includes("platform_super_admin"),
    [principal?.user.id],
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
              {userName(user)}
            </div>
            <div className="truncate text-xs text-slate-400">{user.username}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: "w-44",
        render: (user) => {
          const protectedUser = isProtected(user);
          const checked = user.status === "active";
          const label =
            user.status === "active"
              ? t("identity_admin.status_active")
              : user.status === "locked"
                ? t("identity_admin.status_locked")
                : t("identity_admin.status_disabled");
          return (
            <PermissionGate permission="tenant.users.update" fallback={<span>{label}</span>}>
              <div className="flex items-center gap-2.5">
                <ToggleSwitch
                  checked={checked}
                  disabled={protectedUser || busy}
                  ariaLabel={t("identity_admin.change_user_status", { username: user.username })}
                  onCheckedChange={(next) => {
                    if (!next) {
                      setDisableUser(user);
                      return;
                    }
                    void run(
                      () =>
                        identityApi.updateUser(user.id, {
                          status: "active",
                          version: user.version,
                        }),
                      t("identity_admin.user_status_updated"),
                    );
                  }}
                />
                <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
              </div>
            </PermissionGate>
          );
        },
      },
      {
        key: "roles",
        label: t("identity_admin.roles"),
        width: "w-72",
        render: (user) => {
          const labels = (user.role_ids ?? []).map(
            (roleId, index) => roleNames.get(roleId) ?? user.role_codes?.[index] ?? roleId,
          );
          return (
            <div className="flex flex-wrap gap-1.5">
              {(labels.length ? labels : (user.role_codes ?? [])).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/8 dark:text-slate-300"
                >
                  {label}
                </span>
              ))}
              {!labels.length && !user.role_codes?.length ? (
                <span className="text-slate-400">{t("identity_admin.no_role")}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "last_login",
        label: t("identity_admin.last_login"),
        width: "w-52",
        render: (user) =>
          user.last_login_at
            ? new Date(user.last_login_at).toLocaleString(i18n.language)
            : t("identity_admin.never"),
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        render: (user) => {
          const protectedUser = isProtected(user);
          return (
            <div className="flex items-center gap-1.5">
              <PermissionGate permission="tenant.users.reset_password">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={protectedUser || busy}
                  tooltip={t("identity_admin.reset_password")}
                  onClick={() => {
                    setResetUser(user);
                    setResetPassword("");
                  }}
                >
                  <KeyRound size={15} />
                </Button>
              </PermissionGate>
              <PermissionGate permission="tenant.users.delete">
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                  disabled={protectedUser || busy}
                  tooltip={t("identity_admin.delete")}
                  onClick={() => setDeleteUser(user)}
                >
                  <Trash2 size={15} />
                </Button>
              </PermissionGate>
            </div>
          );
        },
      },
    ],
    [busy, i18n.language, isProtected, roleNames, run, t, userName],
  );

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    const success = await run(
      () =>
        identityApi.createUser({
          username: form.username,
          display_name: form.displayName,
          password: form.password,
          role_ids: canAssignRoles ? form.roleIds : [],
        }),
      t("identity_admin.user_created"),
    );
    if (success) {
      setCreateOpen(false);
      setForm(emptyForm);
    }
  };

  const submitResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!resetUser) return;
    const success = await run(
      () => identityApi.resetPassword(resetUser.id, resetPassword),
      t("identity_admin.password_reset"),
    );
    if (success) setResetUser(null);
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
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("identity_admin.new_user")}
            </Button>
          </PermissionGate>
        </div>

        <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
          <DataTable<UserIdentity>
            tableId="identity-users"
            rows={users}
            columns={columns}
            rowKey={(user) => user.id}
            loading={loading}
            virtualize={false}
            rowHeight={60}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[900px]"
            emptyText={t("identity_admin.no_users")}
            showAllLoadedMessage={false}
          />
        </div>
      </div>

      <Modal
        open={createOpen}
        title={t("identity_admin.new_user")}
        description={t("identity_admin.users_description")}
        onClose={() => setCreateOpen(false)}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-user-form" variant="primary" disabled={busy}>
              {t("identity_admin.create_user")}
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={createUser} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.username")}
            </span>
            <TextInput
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.display_name")}
            </span>
            <TextInput
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.initial_password")}
            </span>
            <TextInput
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              minLength={12}
            />
          </label>
          {canAssignRoles && canReadRoles ? (
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.roles")}
              </span>
              <MultiSelect
                options={roleOptions}
                value={form.roleIds}
                onChange={(roleIds) => setForm({ ...form, roleIds })}
              />
            </div>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(resetUser)}
        title={t("identity_admin.reset_password")}
        onClose={() => setResetUser(null)}
        maxWidth="max-w-md"
        footer={
          <>
            <Button onClick={() => setResetUser(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="reset-user-password-form" variant="primary" disabled={busy}>
              {t("identity_admin.save")}
            </Button>
          </>
        }
      >
        <form id="reset-user-password-form" onSubmit={submitResetPassword} className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.new_password")}
            </span>
            <TextInput
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
              required
              minLength={12}
            />
          </label>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(disableUser)}
        title={t("identity_admin.disable_user")}
        description={
          disableUser
            ? t("identity_admin.disable_user_confirm", { username: disableUser.username })
            : ""
        }
        confirmText={t("identity_admin.disable")}
        busy={busy}
        onClose={() => setDisableUser(null)}
        onConfirm={() => {
          if (!disableUser) return;
          void run(
            () =>
              identityApi.updateUser(disableUser.id, {
                status: "disabled",
                version: disableUser.version,
              }),
            t("identity_admin.user_status_updated"),
          ).then((success) => {
            if (success) setDisableUser(null);
          });
        }}
      />

      <ConfirmModal
        open={Boolean(deleteUser)}
        title={t("identity_admin.delete")}
        description={
          deleteUser
            ? t("identity_admin.delete_user_confirm", { username: deleteUser.username })
            : ""
        }
        confirmText={t("identity_admin.delete")}
        busy={busy}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => {
          if (!deleteUser) return;
          void run(
            () => identityApi.deleteUser(deleteUser.id),
            t("identity_admin.user_deleted"),
          ).then((success) => {
            if (success) setDeleteUser(null);
          });
        }}
      />
    </section>
  );
}
