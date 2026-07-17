import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Trash2, Unlock } from "lucide-react";
import { endUsersApi, type CreateEndUserResult, type EndUser } from "@code-proxy/api-client";
import {
  Button,
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

export function EndUsersPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const { can } = useAuth();
  const [users, setUsers] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [createdSecrets, setCreatedSecrets] = useState<CreateEndUserResult | null>(null);
  const [resetUser, setResetUser] = useState<EndUser | null>(null);
  const [generatedReset, setGeneratedReset] = useState("");
  const [deleteUser, setDeleteUser] = useState<EndUser | null>(null);
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
        width: "w-40",
        render: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900 dark:text-white">
              {row.display_name}
            </div>
            <div className="truncate text-xs text-slate-400">{row.username}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: t("end_users.status", { defaultValue: "状态" }),
        width: "w-28",
        render: (row) => row.status,
      },
      {
        key: "last_login",
        label: t("end_users.last_login", { defaultValue: "最近登录" }),
        width: "w-44",
        render: (row) => row.last_login_at?.slice(0, 19).replace("T", " ") || "—",
      },
      {
        key: "actions",
        label: t("common.actions", { defaultValue: "操作" }),
        width: "w-36",
        render: (row) => (
          <div className="flex items-center gap-1">
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
    [canWrite, t, unlock],
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
    <PermissionGate permission="end_users.read">
      <section className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">
                {t("end_users.title", { defaultValue: "用户账号" })}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-white/55">
                {t("end_users.subtitle", {
                  defaultValue: "门户账号（与后台管理员隔离），每人可持有多把 API Key。",
                })}
              </p>
            </div>
            {canWrite ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t("end_users.create", { defaultValue: "创建用户" })}
              </Button>
            ) : null}
          </div>
          <div className="relative h-[calc(100dvh-250px)] min-h-[360px] overflow-hidden px-5 pb-5">
            <DataTable
              tableId="end-users"
              rows={users}
              columns={columns}
              rowKey={(r) => r.id}
              loading={loading}
              virtualize={false}
              rowHeight={60}
              height="h-full"
              minHeight="min-h-full"
              emptyText={t("end_users.empty", { defaultValue: "暂无用户账号" })}
              showAllLoadedMessage={false}
            />
          </div>
        </div>
      </section>

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
    </PermissionGate>
  );
}
