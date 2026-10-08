import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Shield, Trash2 } from "lucide-react";
import { identityApi, type RoleIdentity, type UserIdentity } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  DataTable,
  SecretRevealModal,
  TABLE_ROW_ACTIONS_COLUMN,
  ToggleSwitch,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { resolvePasswordApiError } from "@features/password-policy";
import { CreateUserModal } from "./CreateUserModal";
import {
  DeleteUserConfirm,
  DisableUserConfirm,
  ResetPasswordModal,
  SetRolesModal,
} from "./UserDialogs";
import { normalizeUsername, type CreateUserForm } from "./userForm";

const isTenantAdmin = (user: UserIdentity) => user.role_codes?.includes("tenant_admin");

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
  const [resetUser, setResetUser] = useState<UserIdentity | null>(null);
  const [rolesUser, setRolesUser] = useState<UserIdentity | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserIdentity | null>(null);
  const [disableUser, setDisableUser] = useState<UserIdentity | null>(null);
  // 刚创建的账号：用户名和服务端生成的初始密码一起展示，方便整组复制给对方。
  const [revealed, setRevealed] = useState<{ username: string; password: string } | null>(null);
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
    async (
      action: () => Promise<unknown>,
      success: string,
      // Without this every rejection falls through to error.message, which is
      // the server's English text even when the panel has a translation for it.
      resolveError?: (error: unknown) => string | null,
    ) => {
      setBusy(true);
      try {
        await action();
        await load();
        notify({ type: "success", message: success });
        return true;
      } catch (error) {
        const resolved = resolveError?.(error) ?? null;
        notify({
          type: "error",
          message:
            resolved ??
            (error instanceof Error ? error.message : t("identity_admin.operation_failed")),
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
  const cannotAssignRoles = useCallback(
    (user: UserIdentity) => isProtected(user) || isTenantAdmin(user),
    [isProtected],
  );
  const cannotDelete = useCallback(
    (user: UserIdentity) => isProtected(user) || isTenantAdmin(user),
    [isProtected],
  );
  /** 角色为什么改不了（与 cannotAssignRoles 同一组条件），弹窗里直接告诉用户。 */
  const rolesLockedReason = (user: UserIdentity | null) => {
    if (!user || !cannotAssignRoles(user)) return null;
    if (user.id === principal?.user.id) return t("identity_admin.roles_locked_self");
    if (user.role_codes?.includes("platform_super_admin")) {
      return t("identity_admin.roles_locked_super_admin");
    }
    return t("identity_admin.roles_locked_tenant_admin");
  };

  const columns = useMemo<DataTableColumn<UserIdentity>[]>(
    () => [
      {
        key: "user",
        label: t("identity_admin.user"),
        width: COLUMN_WIDTH.name,
        render: (user) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-ink">{userName(user)}</div>
            <div className="truncate text-xs text-ink-3">{user.username}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: COLUMN_WIDTH.toggle,
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
                <span className="text-sm text-ink-2">{label}</span>
              </div>
            </PermissionGate>
          );
        },
      },
      {
        key: "roles",
        label: t("identity_admin.roles"),
        width: COLUMN_WIDTH.nameStacked,
        render: (user) => {
          const labels = (user.role_ids ?? []).map(
            (roleId, index) => roleNames.get(roleId) ?? user.role_codes?.[index] ?? roleId,
          );
          return (
            <div className="flex flex-wrap gap-1.5">
              {(labels.length ? labels : (user.role_codes ?? [])).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium text-ink-2 dark:bg-white/[0.07]"
                >
                  {label}
                </span>
              ))}
              {!labels.length && !user.role_codes?.length ? (
                <span className="text-ink-3">{t("identity_admin.no_role")}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "last_login",
        label: t("identity_admin.last_login"),
        width: COLUMN_WIDTH.timestamp,
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
          const rolesDisabled = cannotAssignRoles(user);
          const deleteDisabled = cannotDelete(user);
          return (
            <div className="flex items-center gap-1.5">
              <PermissionGate permission="tenant.users.assign_roles">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={rolesDisabled || busy || !canReadRoles}
                  tooltip={t("identity_admin.set_roles")}
                  onClick={() => {
                    if (cannotAssignRoles(user)) return;
                    setRolesUser(user);
                  }}
                >
                  <Shield size={15} />
                </Button>
              </PermissionGate>
              <PermissionGate permission="tenant.users.reset_password">
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={protectedUser || busy}
                  tooltip={t("identity_admin.reset_password")}
                  onClick={() => setResetUser(user)}
                >
                  <KeyRound size={15} />
                </Button>
              </PermissionGate>
              <PermissionGate permission="tenant.users.delete">
                <Button
                  size="xs"
                  variant="ghost-danger"
                  disabled={deleteDisabled || busy}
                  tooltip={t("identity_admin.delete")}
                  onClick={() => {
                    if (!cannotDelete(user)) setDeleteUser(user);
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </PermissionGate>
            </div>
          );
        },
      },
    ],
    [
      busy,
      canReadRoles,
      cannotAssignRoles,
      cannotDelete,
      i18n.language,
      isProtected,
      roleNames,
      run,
      t,
      userName,
    ],
  );

  /** 创建成功返回 null；服务端拒绝了手动设置的密码时返回该错误，由弹窗显示在密码框下。 */
  const createUser = async (form: CreateUserForm): Promise<string | null> => {
    setBusy(true);
    try {
      const username = normalizeUsername(form.username);
      const created = await identityApi.createUser({
        username,
        display_name: form.displayName.trim(),
        password: form.passwordMode === "manual" ? form.password : "",
        role_ids: canAssignRoles ? form.roleIds : [],
      });
      await load();
      notify({ type: "success", message: t("identity_admin.user_created") });
      setCreateOpen(false);
      if (created.initial_password) {
        setRevealed({ username: created.username || username, password: created.initial_password });
      }
      return null;
    } catch (error) {
      const policy = resolvePasswordApiError(error, t);
      if (policy) return policy;
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submitResetPassword = async (password: string): Promise<string | null> => {
    if (!resetUser) return null;
    let policyError: string | null = null;
    const success = await run(
      () => identityApi.resetPassword(resetUser.id, password),
      t("identity_admin.password_reset"),
      (error) => {
        policyError = resolvePasswordApiError(error, t);
        return policyError;
      },
    );
    if (success) setResetUser(null);
    return policyError;
  };

  const submitRoles = async (roleIds: string[]) => {
    if (!rolesUser || cannotAssignRoles(rolesUser)) return;
    const success = await run(
      () => identityApi.assignUserRoles(rolesUser.id, roleIds),
      t("identity_admin.roles_saved"),
    );
    if (success) setRolesUser(null);
  };

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      {/* 不再包一层卡片：外壳内容区就是这一页的面板，标题和表格直接落在上面（同请求日志页）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{t("identity_admin.users_title")}</h2>
            <p className="text-sm text-ink-3">{t("identity_admin.users_description")}</p>
          </div>
          <PermissionGate permission="tenant.users.create">
            <Button
              variant="primary"
              onClick={() => setCreateOpen(true)}
            >
              {t("identity_admin.new_user")}
            </Button>
          </PermissionGate>
        </div>

        {/* 表格吃掉页面剩余高度、内部滚动；不设最小高度保底——页面高度被窗口钉死，保底只会在矮窗口下把表格挤出页面（见请求日志页）。 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
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

      <CreateUserModal
        open={createOpen}
        busy={busy}
        showRoles={canAssignRoles && canReadRoles}
        roleOptions={roleOptions}
        onSubmit={createUser}
        onClose={() => setCreateOpen(false)}
      />

      <ResetPasswordModal
        user={resetUser}
        name={resetUser ? userName(resetUser) : ""}
        busy={busy}
        onSubmit={submitResetPassword}
        onClose={() => setResetUser(null)}
      />

      <SetRolesModal
        user={rolesUser}
        busy={busy}
        roleOptions={roleOptions}
        lockedReason={rolesLockedReason(rolesUser)}
        onSubmit={(roleIds) => void submitRoles(roleIds)}
        onClose={() => setRolesUser(null)}
      />

      <SecretRevealModal
        open={revealed !== null}
        title={t("identity_admin.initial_password_title")}
        description={t("identity_admin.initial_password_handover")}
        items={
          revealed
            ? [
                { label: t("identity_admin.username"), value: revealed.username },
                { label: t("identity_admin.initial_password"), value: revealed.password },
              ]
            : []
        }
        onClose={() => setRevealed(null)}
      />

      <DisableUserConfirm
        user={disableUser}
        name={disableUser ? userName(disableUser) : ""}
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

      <DeleteUserConfirm
        user={deleteUser}
        name={deleteUser ? userName(deleteUser) : ""}
        busy={busy}
        onClose={() => setDeleteUser(null)}
        onConfirm={() => {
          if (!deleteUser || cannotDelete(deleteUser)) return;
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
