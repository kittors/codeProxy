import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Key, KeyRound, Pencil, Trash2, Unlock } from "lucide-react";
import { endUsersApi, type CreateEndUserResult, type EndUser } from "@code-proxy/api-client";
import {
  Button,
  Card,
  ConfirmModal,
  DataTable,
  Modal,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";

const emptyForm = { username: "", displayName: "", password: "" };

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";

const ApiKeysPage = lazy(() =>
  import("../api-keys/ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

export function EndUsersPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const { can } = useAuth();
  const [users, setUsers] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createdSecrets, setCreatedSecrets] = useState<CreateEndUserResult | null>(null);
  const [editUser, setEditUser] = useState<EndUser | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [resetUser, setResetUser] = useState<EndUser | null>(null);
  const [generatedReset, setGeneratedReset] = useState("");
  const [deleteUser, setDeleteUser] = useState<EndUser | null>(null);
  const [keysUser, setKeysUser] = useState<EndUser | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = can("end_users.write");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endUsersApi.list();
      setUsers(res.items ?? []);
    } catch (e) {
      notify({ type: "error", message: e instanceof Error ? e.message : "load failed" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const unlock = useCallback(
    async (row: EndUser) => {
      setBusy(true);
      try {
        await endUsersApi.update(row.id, { status: "active" });
        notify({ type: "success", message: t("end_users.unlocked", { defaultValue: "已解冻" }) });
        await load();
      } catch (e) {
        notify({ type: "error", message: e instanceof Error ? e.message : "failed" });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const columns = useMemo<DataTableColumn<EndUser>[]>(
    () => [
      {
        key: "username",
        label: t("end_users.username", { defaultValue: "用户名" }),
        width: "w-56 min-w-[14rem]",
        minWidthPx: 160,
        maxWidthPx: 480,
        headerClassName: "text-left",
        cellClassName: "text-left",
        render: (row) => {
          const extraKeys = Math.max(0, (row.api_key_count ?? 0) - 1);
          return (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium text-slate-900 dark:text-white">
                  {row.display_name}
                </span>
                {extraKeys > 0 ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
                    +{extraKeys}
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-slate-400">{row.username}</div>
            </div>
          );
        },
      },
      {
        key: "status",
        label: t("end_users.status", { defaultValue: "状态" }),
        width: "w-28 min-w-[7rem]",
        minWidthPx: 96,
        maxWidthPx: 220,
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => row.status,
      },
      {
        key: "last_login",
        label: t("end_users.last_login", { defaultValue: "最近登录" }),
        width: "w-48 min-w-[12rem]",
        minWidthPx: 140,
        maxWidthPx: 320,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => row.last_login_at?.slice(0, 19).replace("T", " ") || "—",
      },
      {
        key: "actions",
        label: t("common.actions", { defaultValue: "操作" }),
        width: "w-44 min-w-[11rem]",
        minWidthPx: 168,
        maxWidthPx: 220,
        resizable: false,
        lockOrder: "end",
        headerClassName: stickyActionsHeaderClass,
        cellClassName: stickyActionsCellClass,
        render: (row) => (
          <div className="flex items-center justify-center gap-1">
            {can("api_keys.read") ? (
              <Button
                size="sm"
                variant="ghost"
                title={t("end_users.manage_keys", { defaultValue: "管理密钥" })}
                onClick={() => setKeysUser(row)}
              >
                <Key className="h-4 w-4" />
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                size="sm"
                variant="ghost"
                title={t("end_users.edit", { defaultValue: "编辑" })}
                onClick={() => {
                  setEditUser(row);
                  setEditForm({
                    username: row.username,
                    displayName: row.display_name,
                    password: "",
                  });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {canWrite && row.status === "locked" ? (
              <Button size="sm" variant="ghost" title="解冻" onClick={() => void unlock(row)}>
                <Unlock className="h-4 w-4" />
              </Button>
            ) : null}
            {canWrite ? (
              <Button size="sm" variant="ghost" title="重置密码" onClick={() => setResetUser(row)}>
                <KeyRound className="h-4 w-4" />
              </Button>
            ) : null}
            {canWrite ? (
              <Button size="sm" variant="ghost" title="删除" onClick={() => setDeleteUser(row)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [can, canWrite, t, unlock],
  );

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await endUsersApi.create({
        username: form.username.trim() || undefined,
        display_name: form.displayName.trim(),
        password: form.password || undefined,
      });
      setCreateOpen(false);
      setForm(emptyForm);
      if (result.generated_password || result.default_api_key?.key) {
        setCreatedSecrets(result);
      } else {
        notify({ type: "success", message: t("end_users.created", { defaultValue: "已创建" }) });
      }
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!resetUser) return;
    setBusy(true);
    try {
      const res = await endUsersApi.resetPassword(resetUser.id);
      setGeneratedReset(res.generated_password || "");
      notify({
        type: "success",
        message: t("end_users.password_reset", { defaultValue: "密码已重置，请立即复制" }),
      });
      setResetUser(null);
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setBusy(true);
    try {
      const body: {
        username?: string;
        display_name?: string;
        password?: string;
      } = {};
      const nextUsername = editForm.username.trim();
      const nextDisplay = editForm.displayName.trim();
      if (nextUsername && nextUsername !== editUser.username) body.username = nextUsername;
      if (nextDisplay && nextDisplay !== editUser.display_name) body.display_name = nextDisplay;
      if (editForm.password.trim()) body.password = editForm.password;
      if (!body.username && !body.display_name && !body.password) {
        setEditUser(null);
        return;
      }
      await endUsersApi.update(editUser.id, body);
      notify({ type: "success", message: t("end_users.updated", { defaultValue: "已保存" }) });
      setEditUser(null);
      setEditForm(emptyForm);
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!deleteUser) return;
    setBusy(true);
    try {
      await endUsersApi.remove(deleteUser.id);
      setDeleteUser(null);
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGate permission="end_users.read" anyOf={["api_keys.read"]}>
      {/* Match AI accounts / api-keys card height so top/bottom shell padding stay even on large screens. */}
      <div className="space-y-6">
        <Card
          className="md:flex md:h-[calc(100dvh-112px)] md:min-h-0 md:flex-col md:overflow-hidden"
          bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
          title={t("end_users.title", { defaultValue: "用户账号" })}
          description={t("end_users.subtitle", {
            defaultValue:
              "门户用户账号（与后台管理员隔离）。点击「密钥」管理该用户下全部 API Key（限额/权限/启停等）。",
          })}
          actions={
            canWrite ? (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                {t("end_users.create", { defaultValue: "创建用户" })}
              </Button>
            ) : null
          }
          loading={loading}
        >
          <DataTable
            tableId="end-users"
            rows={users}
            columns={columns}
            rowKey={(r) => r.id}
            virtualize={false}
            rowHeight={60}
            height="h-[calc(100dvh-260px)] md:h-auto md:flex-1"
            minHeight="min-h-[320px] md:min-h-0"
            minWidth="min-w-[720px]"
            emptyText={t("end_users.empty", { defaultValue: "暂无用户账号" })}
            showAllLoadedMessage={false}
            columnResizable
          />
        </Card>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("end_users.create", { defaultValue: "创建用户" })}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              type="submit"
              form="create-end-user-form"
              variant="primary"
              disabled={busy || !form.displayName.trim()}
            >
              {t("end_users.create", { defaultValue: "创建" })}
            </Button>
          </>
        }
      >
        <form id="create-end-user-form" className="space-y-3" onSubmit={onCreate}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.display_name", { defaultValue: "昵称" })}
            </span>
            <TextInput
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.username", { defaultValue: "用户名（可选）" })}
            </span>
            <TextInput
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="空则按昵称生成"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.password", { defaultValue: "密码（可选）" })}
            </span>
            <TextInput
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="空则随机生成，请立即复制"
            />
          </label>
          <p className="text-xs text-amber-600">
            {t("end_users.password_hint", {
              defaultValue: "不填密码将随机生成；生成后只展示一次，哈希后无法再查看。",
            })}
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(createdSecrets)}
        onClose={() => setCreatedSecrets(null)}
        title={t("end_users.copy_secrets", { defaultValue: "请立即复制凭证" })}
      >
        {createdSecrets ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-amber-600">离开此窗口后无法再查看明文密码 / API Key。</p>
            <div>
              用户名：<code>{createdSecrets.user.username}</code>
            </div>
            {createdSecrets.generated_password ? (
              <div>
                密码：
                <code className="select-all break-all">{createdSecrets.generated_password}</code>
              </div>
            ) : null}
            {createdSecrets.default_api_key?.key ? (
              <div>
                默认 API Key：
                <code className="select-all break-all">{createdSecrets.default_api_key.key}</code>
              </div>
            ) : null}
            <Button onClick={() => setCreatedSecrets(null)}>已复制，关闭</Button>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(editUser)}
        onClose={() => {
          setEditUser(null);
          setEditForm(emptyForm);
        }}
        title={t("end_users.edit", { defaultValue: "编辑用户账号" })}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button
              onClick={() => {
                setEditUser(null);
                setEditForm(emptyForm);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              form="edit-end-user-form"
              variant="primary"
              disabled={busy || !editForm.displayName.trim() || !editForm.username.trim()}
            >
              {t("common.save", { defaultValue: "保存" })}
            </Button>
          </>
        }
      >
        <form id="edit-end-user-form" className="space-y-3" onSubmit={onEdit}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.display_name", { defaultValue: "昵称" })}
            </span>
            <TextInput
              value={editForm.displayName}
              onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.username", { defaultValue: "用户名" })}
            </span>
            <TextInput
              value={editForm.username}
              onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.password", { defaultValue: "新密码（可选）" })}
            </span>
            <TextInput
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={t("end_users.password_keep", { defaultValue: "留空则不改密码" })}
              autoComplete="new-password"
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(generatedReset)}
        onClose={() => setGeneratedReset("")}
        title="新密码（请立即复制）"
      >
        <code className="select-all break-all">{generatedReset}</code>
      </Modal>

      <ConfirmModal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title="重置密码"
        description={`将为 ${resetUser?.username ?? ""} 生成新随机密码，旧会话失效。`}
        confirmText="重置"
        busy={busy}
        onConfirm={() => void onReset()}
      />
      <ConfirmModal
        open={Boolean(deleteUser)}
        onClose={() => setDeleteUser(null)}
        title={t("end_users.delete_title", { defaultValue: "删除用户账号" })}
        description={`删除 ${deleteUser?.username ?? ""}？其 API Key 将被禁用并解除归属，且无法再用于调用。`}
        confirmText="删除"
        busy={busy}
        onConfirm={() => void onDelete()}
      />

      <Modal
        open={Boolean(keysUser)}
        onClose={() => {
          setKeysUser(null);
          void load();
        }}
        title={
          keysUser
            ? t("end_users.manage_keys_title_for", {
                defaultValue: "管理密钥 · {{name}}",
                name: keysUser.display_name || keysUser.username,
              })
            : t("end_users.manage_keys_title", { defaultValue: "用户 API 密钥" })
        }
        description={t("end_users.manage_keys_desc", {
          defaultValue: "管理该用户账号下的全部 API 密钥（限额、权限、启停等）。",
        })}
        maxWidth="max-w-[96vw]"
        panelClassName="h-[min(90dvh,920px)]"
        bodyHeightClassName="h-[calc(min(90dvh,920px)-7.5rem)]"
        bodyOverflowClassName="overflow-hidden"
        bodyClassName="!p-0"
      >
        {keysUser ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading…
              </div>
            }
          >
            <ApiKeysPage endUserId={keysUser.id} embed />
          </Suspense>
        ) : null}
      </Modal>
    </PermissionGate>
  );
}
