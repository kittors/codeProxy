import { useCallback, useEffect, useMemo, useState } from "react";
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
  COLUMN_WIDTH,
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { buildPermissionTree, PermissionTree } from "./PermissionTree";
import {
  AssignRoleUsersModal,
  CreateRoleModal,
  DeleteRoleConfirm,
  RolePermissionsModal,
  type RoleForm,
} from "./RoleDialogs";
const hasProtectedRoleAssignments = (user: UserIdentity) =>
  user.role_codes?.some((code) => code === "platform_super_admin" || code === "tenant_admin");

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
              <span className="truncate font-medium text-ink">{roleName(role)}</span>
              {/* 「受保护」是角色的属性说明：简约风格是中性淡底标签，多彩风格是蓝色淡底。 */}
              {role.system_protected ? (
                <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-semibold text-ink-2 dark:bg-white/[0.07] colorful:bg-blue-50 colorful:text-blue-700 colorful:dark:bg-blue-500/10 colorful:dark:text-blue-300">
                  {t("identity_admin.protected_role")}
                </span>
              ) : null}
            </div>
            <div className="truncate text-xs text-ink-3">{role.code}</div>
          </div>
        ),
      },
      {
        key: "scope",
        label: t("identity_admin.scope"),
        width: COLUMN_WIDTH.compact,
        render: (role) =>
          role.scope === "platform"
            ? t("identity_admin.scope_platform")
            : t("identity_admin.scope_tenant"),
      },
      {
        key: "permissions",
        label: t("identity_admin.permissions"),
        width: COLUMN_WIDTH.numericWide,
        render: (role) => t("identity_admin.permission_count", { count: role.permissions.length }),
      },
      {
        key: "users",
        label: t("identity_admin.assigned_users"),
        width: COLUMN_WIDTH.timestamp,
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
                disabled={role.system_protected}
                tooltip={t("identity_admin.assign_users")}
                onClick={() => {
                  if (role.system_protected) return;
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
                  variant="ghost-danger"
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

  const createRole = async (form: RoleForm) => {
    const success = await run(
      () => identityApi.createRole({ ...form, permissions: [] }),
      t("identity_admin.role_created"),
    );
    if (success) setCreateOpen(false);
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
    if (!userRole || userRole.system_protected) return;
    const success = await run(
      () => identityApi.replaceRoleUsers(userRole.id, [...selectedUsers], userRole.version),
      t("identity_admin.role_users_saved"),
    );
    if (success) setUserRole(null);
  };

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      {/* 不再包一层卡片：外壳内容区就是这一页的面板，标题和表格直接落在上面（同请求日志页）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t("identity_admin.roles_title")}</h2>
            <p className="text-sm text-ink-3">{t("identity_admin.roles_description")}</p>
          </div>
          <PermissionGate permission="tenant.roles.create">
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              {t("identity_admin.new_role")}
            </Button>
          </PermissionGate>
        </div>

        {/* 表格吃掉页面剩余高度、内部滚动；不设最小高度保底——页面高度被窗口钉死，保底只会在矮窗口下把表格挤出页面（见请求日志页）。 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
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

      <CreateRoleModal
        open={createOpen}
        busy={busy}
        onSubmit={(form) => void createRole(form)}
        onClose={() => setCreateOpen(false)}
      />

      <RolePermissionsModal
        role={permissionRole}
        title={
          permissionRole
            ? t("identity_admin.role_permissions_title", { name: roleName(permissionRole) })
            : ""
        }
        readOnlyReason={
          permissionRole?.system_protected
            ? t("identity_admin.permissions_read_only_protected")
            : !canUpdateRoles
              ? t("identity_admin.permissions_read_only_no_access")
              : null
        }
        selectedCount={selectedPermissions.size}
        busy={busy}
        onSave={() => void savePermissions()}
        onClose={() => setPermissionRole(null)}
      >
        <PermissionTree
          nodes={permissionTreeNodes}
          selected={selectedPermissions}
          disabled={Boolean(permissionRole?.system_protected) || !canUpdateRoles}
          onChange={setSelectedPermissions}
          expandLabel={t("identity_admin.tree_expand")}
          collapseLabel={t("identity_admin.tree_collapse")}
        />
      </RolePermissionsModal>

      <AssignRoleUsersModal
        role={userRole}
        title={userRole ? t("identity_admin.assign_role_users_title", { name: roleName(userRole) }) : ""}
        users={users}
        loading={loading}
        selected={selectedUsers}
        isLocked={(user) => Boolean(hasProtectedRoleAssignments(user))}
        userName={userName}
        busy={busy}
        onChange={setSelectedUsers}
        onSave={() => void saveUsers()}
        onClose={() => setUserRole(null)}
      />

      <DeleteRoleConfirm
        role={deleteRole}
        name={deleteRole ? roleName(deleteRole) : ""}
        assignedCount={deleteRole && canReadUsers ? (assignedUserCount.get(deleteRole.id) ?? 0) : null}
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
