import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
import {
  identityApi,
  type PermissionIdentity,
  type RoleIdentity,
  type UserIdentity,
} from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
  ConfirmModal,
  DataTable,
  Modal,
  TABLE_ROW_ACTIONS_COLUMN,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { buildPermissionTree, PermissionTree } from "./PermissionTree";

const emptyForm = { name: "", description: "" };

export function RolesPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const {
    can,
    state: { principal },
  } = useAuth();
  const [roles, setRoles] = useState<RoleIdentity[]>([]);
  const [permissions, setPermissions] = useState<PermissionIdentity[]>([]);
  const [users, setUsers] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [permissionRole, setPermissionRole] = useState<RoleIdentity | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [userRole, setUserRole] = useState<RoleIdentity | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [deleteRole, setDeleteRole] = useState<RoleIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const canUpdateRoles = can("tenant.roles.update");
  const canReadUsers = can("tenant.users.read");
  const canAssignUsers = can("tenant.users.assign_roles") && canReadUsers && canUpdateRoles;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesResponse, permissionsResponse, usersResponse] = await Promise.all([
        identityApi.roles(),
        identityApi.permissions(),
        canReadUsers ? identityApi.users() : Promise.resolve({ items: [] as UserIdentity[] }),
      ]);
      setRoles(rolesResponse.items ?? []);
      setPermissions(permissionsResponse.items ?? []);
      setUsers(usersResponse.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [canReadUsers]);

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

  const roleName = useCallback(
    (role: RoleIdentity) =>
      role.code === "platform_super_admin"
        ? t("identity_admin.administrator_role")
        : role.code === "tenant_admin"
          ? t("identity_admin.tenant_administrator_role")
          : role.name,
    [t],
  );

  const userName = useCallback(
    (user: UserIdentity) =>
      user.role_codes?.includes("platform_super_admin")
        ? t("identity_admin.super_administrator")
        : user.display_name,
    [t],
  );

  const permissionLabel = useCallback(
    (permission: PermissionIdentity) =>
      t("identity_admin.permission_label", {
        action: t(`identity_admin.permission_actions.${permission.action}`, {
          defaultValue: permission.action,
        }),
        resource: t(`identity_admin.permission_resources.${permission.resource}`, {
          defaultValue: permission.resource,
        }),
      }),
    [t],
  );

  const availablePermissions = useMemo(() => {
    if (!permissionRole) return [];
    return permissions.filter(
      (permission) =>
        can(permission.code) &&
        (permissionRole.scope === "platform" || permission.scope === "tenant"),
    );
  }, [can, permissionRole, permissions]);

  const menuLabel = useCallback(
    (menu: { label_key: string; code: string }) => t(menu.label_key, { defaultValue: menu.code }),
    [t],
  );

  const resourceLabel = useCallback(
    (resource: string) =>
      t(`identity_admin.permission_resources.${resource}`, { defaultValue: resource }),
    [t],
  );

  const permissionTreeNodes = useMemo(
    () =>
      buildPermissionTree({
        menus: principal?.menus ?? [],
        permissions: availablePermissions,
        menuLabel,
        permissionLabel,
        resourceLabel,
      }),
    [availablePermissions, menuLabel, permissionLabel, principal?.menus, resourceLabel],
  );

  const assignedUserCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of users) {
      for (const roleId of user.role_ids ?? []) {
        counts.set(roleId, (counts.get(roleId) ?? 0) + 1);
      }
    }
    return counts;
  }, [users]);

  const columns = useMemo<DataTableColumn<RoleIdentity>[]>(
    () => [
      {
        key: "role",
        label: t("identity_admin.roles"),
        width: "w-64",
        render: (role) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-slate-900 dark:text-white">
                {roleName(role)}
              </span>
              {role.system_protected ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-2xs font-semibold text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  {t("identity_admin.protected_role")}
                </span>
              ) : null}
            </div>
            <div className="truncate text-xs text-slate-400">{role.code}</div>
          </div>
        ),
      },
      {
        key: "scope",
        label: t("identity_admin.scope"),
        width: "w-32",
        render: (role) =>
          role.scope === "platform"
            ? t("identity_admin.scope_platform")
            : t("identity_admin.scope_tenant"),
      },
      {
        key: "permissions",
        label: t("identity_admin.permissions"),
        width: "w-32",
        render: (role) => t("identity_admin.permission_count", { count: role.permissions.length }),
      },
      {
        key: "users",
        label: t("identity_admin.assigned_users"),
        width: "w-32",
        render: (role) =>
          t("identity_admin.user_count", { count: assignedUserCount.get(role.id) ?? 0 }),
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        render: (role) => (
          <div className="flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              tooltip={
                role.system_protected || !canUpdateRoles
                  ? t("identity_admin.view_permissions")
                  : t("identity_admin.edit_permissions")
              }
              onClick={() => {
                setPermissionRole(role);
                setSelectedPermissions(new Set(role.permissions));
              }}
            >
              <ShieldCheck size={15} />
            </Button>
            {role.scope === "tenant" && canAssignUsers ? (
              <Button
                size="xs"
                variant="ghost"
                tooltip={t("identity_admin.assign_users")}
                onClick={() => {
                  setUserRole(role);
                  setSelectedUsers(
                    new Set(
                      users
                        .filter((user) => user.role_ids?.includes(role.id))
                        .map((user) => user.id),
                    ),
                  );
                }}
              >
                <UserRoundCog size={15} />
              </Button>
            ) : null}
            {!role.system_protected ? (
              <PermissionGate permission="tenant.roles.delete">
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
                  onClick={() => setDeleteRole(role)}
                  tooltip={t("identity_admin.delete")}
                >
                  <Trash2 size={15} />
                </Button>
              </PermissionGate>
            ) : null}
          </div>
        ),
      },
    ],
    [assignedUserCount, canAssignUsers, canUpdateRoles, roleName, t, users],
  );

  const createRole = async (event: FormEvent) => {
    event.preventDefault();
    const success = await run(
      () => identityApi.createRole({ ...form, permissions: [] }),
      t("identity_admin.role_created"),
    );
    if (success) {
      setCreateOpen(false);
      setForm(emptyForm);
    }
  };

  const savePermissions = async () => {
    if (!permissionRole || permissionRole.system_protected || !canUpdateRoles) return;
    const success = await run(
      () =>
        identityApi.replaceRolePermissions(
          permissionRole.id,
          [...selectedPermissions],
          permissionRole.version,
        ),
      t("identity_admin.role_permissions_saved"),
    );
    if (success) setPermissionRole(null);
  };

  const saveUsers = async () => {
    if (!userRole) return;
    const success = await run(
      () => identityApi.replaceRoleUsers(userRole.id, [...selectedUsers], userRole.version),
      t("identity_admin.role_users_saved"),
    );
    if (success) setUserRole(null);
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
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("identity_admin.new_role")}
            </Button>
          </PermissionGate>
        </div>

        <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
          <DataTable<RoleIdentity>
            tableId="identity-roles"
            rows={roles}
            columns={columns}
            rowKey={(role) => role.id}
            loading={loading}
            virtualize={false}
            rowHeight={64}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[920px]"
            emptyText={t("identity_admin.no_roles")}
            showAllLoadedMessage={false}
          />
        </div>
      </div>

      <Modal
        open={createOpen}
        title={t("identity_admin.new_role")}
        description={t("identity_admin.roles_description")}
        onClose={() => setCreateOpen(false)}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="create-role-form" variant="primary" disabled={busy}>
              {t("identity_admin.create_role")}
            </Button>
          </>
        }
      >
        <form id="create-role-form" onSubmit={createRole} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.role_name")}
            </span>
            <TextInput
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.description")}
            </span>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="min-h-28 w-full rounded-2xl border border-black/[0.04] bg-white px-3.5 py-3 text-sm text-slate-700 outline-none shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] focus:ring-2 focus:ring-slate-300/50 dark:border-transparent dark:bg-[#27272A] dark:text-slate-200"
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(permissionRole)}
        title={
          permissionRole
            ? t("identity_admin.role_permissions_title", { name: roleName(permissionRole) })
            : ""
        }
        description={t("identity_admin.role_permissions_description")}
        onClose={() => setPermissionRole(null)}
        maxWidth="max-w-4xl"
        bodyHeightClassName="max-h-[66vh]"
        footer={
          permissionRole?.system_protected || !canUpdateRoles ? (
            <Button onClick={() => setPermissionRole(null)}>{t("common.close")}</Button>
          ) : (
            <>
              <Button onClick={() => setPermissionRole(null)}>{t("common.cancel")}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void savePermissions()}>
                {t("identity_admin.save")}
              </Button>
            </>
          )
        }
      >
        <PermissionTree
          nodes={permissionTreeNodes}
          selected={selectedPermissions}
          disabled={Boolean(permissionRole?.system_protected) || !canUpdateRoles}
          onChange={setSelectedPermissions}
          expandLabel={t("identity_admin.tree_expand")}
          collapseLabel={t("identity_admin.tree_collapse")}
        />
      </Modal>

      <Modal
        open={Boolean(userRole)}
        title={
          userRole ? t("identity_admin.assign_role_users_title", { name: roleName(userRole) }) : ""
        }
        description={t("identity_admin.assign_role_users_description")}
        onClose={() => setUserRole(null)}
        maxWidth="max-w-2xl"
        bodyHeightClassName="max-h-[60vh]"
        footer={
          <>
            <Button onClick={() => setUserRole(null)}>{t("common.cancel")}</Button>
            <Button variant="primary" disabled={busy} onClick={() => void saveUsers()}>
              {t("identity_admin.save")}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {users.map((user) => {
            const checked = selectedUsers.has(user.id);
            const disabled = user.role_codes?.includes("platform_super_admin");
            return (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/8"
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(nextChecked) => {
                    const next = new Set(selectedUsers);
                    if (nextChecked) next.add(user.id);
                    else next.delete(user.id);
                    setSelectedUsers(next);
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                    {userName(user)}
                  </span>
                  <span className="block truncate text-xs text-slate-400">{user.username}</span>
                </span>
                <span className="text-xs text-slate-400">
                  {user.status === "active"
                    ? t("identity_admin.status_active")
                    : user.status === "locked"
                      ? t("identity_admin.status_locked")
                      : t("identity_admin.status_disabled")}
                </span>
              </label>
            );
          })}
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteRole)}
        title={t("identity_admin.delete")}
        description={
          deleteRole ? t("identity_admin.delete_role_confirm", { name: deleteRole.name }) : ""
        }
        confirmText={t("identity_admin.delete")}
        busy={busy}
        onClose={() => setDeleteRole(null)}
        onConfirm={() => {
          if (!deleteRole) return;
          void run(
            () => identityApi.deleteRole(deleteRole.id),
            t("identity_admin.role_deleted"),
          ).then((success) => {
            if (success) setDeleteRole(null);
          });
        }}
      />
    </section>
  );
}
