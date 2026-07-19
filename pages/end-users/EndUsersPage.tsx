import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Infinity as InfinityIcon, Key, KeyRound, Pencil, Trash2, Unlock } from "lucide-react";
import {
  apiKeyPermissionProfilesApi,
  endUsersApi,
  type ApiKeyPermissionProfile,
  type CreateEndUserResult,
  type EndUser,
  type EndUserUpdateBody,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  ConfirmModal,
  DataTable,
  Modal,
  SecretRevealModal,
  Select,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/guards/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";

const emptyForm = { username: "", displayName: "", password: "", permissionProfileId: "" };

function formatAccountLimit(limit: number | undefined, unlimitedLabel: string) {
  if (!limit || limit <= 0) {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
        <InfinityIcon size={14} /> {unlimitedLabel}
      </span>
    );
  }
  return <span className="tabular-nums">{limit.toLocaleString()}</span>;
}

function formatAccountSpending(limit: number | undefined, unlimitedLabel: string) {
  if (!limit || limit <= 0 || !Number.isFinite(limit)) {
    return (
      <span className="inline-flex items-center justify-center gap-1 text-green-600 dark:text-green-400">
        <InfinityIcon size={14} /> {unlimitedLabel}
      </span>
    );
  }
  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(limit)}
    </span>
  );
}

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
  const [permissionProfiles, setPermissionProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const canWrite = can("end_users.write");
  const unlimitedLabel = t("api_keys_page.unlimited", { defaultValue: "无限制" });

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

  const loadProfiles = useCallback(async () => {
    try {
      const profiles = await apiKeyPermissionProfilesApi.list();
      setPermissionProfiles(Array.isArray(profiles) ? profiles : []);
    } catch {
      setPermissionProfiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfiles();
  }, [load, loadProfiles]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of permissionProfiles) map.set(p.id, p.name);
    return map;
  }, [permissionProfiles]);

  const permissionProfileOptions = useMemo(
    () => [
      { value: "", label: t("api_keys_page.permission_profile_unrestricted", { defaultValue: "不限制" }) },
      ...permissionProfiles.map((p) => ({ value: p.id, label: p.name })),
    ],
    [permissionProfiles, t],
  );

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
        key: "permission",
        label: t("end_users.col_permission", { defaultValue: "权限配置" }),
        width: "w-36 min-w-[9rem]",
        minWidthPx: 120,
        maxWidthPx: 280,
        headerClassName: "text-center",
        cellClassName: "text-center text-slate-700 dark:text-white/70",
        render: (row) => {
          const id = row["permission-profile-id"]?.trim() ?? "";
          if (!id) {
            return (
              <span className="text-green-600 dark:text-green-400">
                {t("api_keys_page.permission_profile_unrestricted", { defaultValue: "不限制" })}
              </span>
            );
          }
          return profileNameById.get(id) || id;
        },
      },
      {
        key: "dailyLimit",
        label: t("api_keys_page.col_daily_limit", { defaultValue: "每日限额" }),
        width: "w-[120px] min-w-[110px]",
        minWidthPx: 100,
        maxWidthPx: 180,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => formatAccountLimit(row["daily-limit"], unlimitedLabel),
      },
      {
        key: "totalQuota",
        label: t("api_keys_page.col_total_quota", { defaultValue: "总配额" }),
        width: "w-[120px] min-w-[110px]",
        minWidthPx: 100,
        maxWidthPx: 180,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => formatAccountLimit(row["total-quota"], unlimitedLabel),
      },
      {
        key: "spendingLimit",
        label: t("api_keys_page.col_spending_limit", { defaultValue: "消费限额" }),
        width: "w-[130px] min-w-[120px]",
        minWidthPx: 110,
        maxWidthPx: 200,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => formatAccountSpending(row["spending-limit"], unlimitedLabel),
      },
      {
        key: "rpmLimit",
        label: "RPM",
        width: "w-[100px] min-w-[90px]",
        minWidthPx: 80,
        maxWidthPx: 140,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => formatAccountLimit(row["rpm-limit"], unlimitedLabel),
      },
      {
        key: "tpmLimit",
        label: "TPM",
        width: "w-[100px] min-w-[90px]",
        minWidthPx: 80,
        maxWidthPx: 140,
        headerClassName: "text-center",
        cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
        render: (row) => formatAccountLimit(row["tpm-limit"], unlimitedLabel),
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
                    permissionProfileId: row["permission-profile-id"] ?? "",
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
    [can, canWrite, profileNameById, t, unlimitedLabel, unlock],
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
      const body: EndUserUpdateBody = {};
      const nextUsername = editForm.username.trim();
      const nextDisplay = editForm.displayName.trim();
      const nextProfile = editForm.permissionProfileId.trim();
      if (nextUsername && nextUsername !== editUser.username) body.username = nextUsername;
      if (nextDisplay && nextDisplay !== editUser.display_name) body.display_name = nextDisplay;
      if (editForm.password.trim()) body.password = editForm.password;
      const prevProfile = (editUser["permission-profile-id"] ?? "").trim();
      if (nextProfile !== prevProfile) {
        body["permission-profile-id"] = nextProfile;
        // Applying a profile: copy limits from template; empty = unrestricted account.
        if (nextProfile) {
          const profile = permissionProfiles.find((p) => p.id === nextProfile);
          if (profile) {
            body["daily-limit"] = profile["daily-limit"];
            body["total-quota"] = profile["total-quota"];
            body["spending-limit"] = 0;
            body["daily-spending-limit"] = profile["daily-spending-limit"];
            body["concurrency-limit"] = profile["concurrency-limit"];
            body["rpm-limit"] = profile["rpm-limit"];
            body["tpm-limit"] = profile["tpm-limit"];
            body["allowed-models"] = [...profile["allowed-models"]];
            body["allowed-channels"] = [...profile["allowed-channels"]];
            body["allowed-channel-groups"] = [...profile["allowed-channel-groups"]];
            body["system-prompt"] = profile["system-prompt"];
          }
        } else {
          body["daily-limit"] = 0;
          body["total-quota"] = 0;
          body["spending-limit"] = 0;
          body["daily-spending-limit"] = 0;
          body["concurrency-limit"] = 0;
          body["rpm-limit"] = 0;
          body["tpm-limit"] = 0;
          body["allowed-models"] = [];
          body["allowed-channels"] = [];
          body["allowed-channel-groups"] = [];
          body["system-prompt"] = "";
        }
      }
      if (
        !body.username &&
        !body.display_name &&
        !body.password &&
        body["permission-profile-id"] === undefined
      ) {
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
              "门户用户账号（与后台管理员隔离）。每日限额/总配额/权限在账号上统一配置，该用户下全部 API Key 共用同一额度池。",
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
            minWidth="min-w-[1100px]"
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
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("api_keys_page.form_permission_profile", { defaultValue: "权限配置" })}
            </span>
            <Select
              value={editForm.permissionProfileId}
              onChange={(value) => setEditForm((f) => ({ ...f, permissionProfileId: value }))}
              options={permissionProfileOptions}
              aria-label={t("api_keys_page.form_permission_profile", { defaultValue: "权限配置" })}
              placeholder={t("api_keys_page.form_permission_profile_placeholder", {
                defaultValue: "选择权限模板",
              })}
            />
            <p className="text-xs text-slate-400 dark:text-white/40">
              {t("end_users.quota_on_account_hint", {
                defaultValue: "限额与模型/渠道权限挂在账号上，该用户所有密钥共用。",
              })}
            </p>
          </label>
        </form>
      </Modal>

      <SecretRevealModal
        open={Boolean(generatedReset)}
        onClose={() => setGeneratedReset("")}
        title={t("end_users.new_password_title", { defaultValue: "新密码（请立即复制）" })}
        secret={generatedReset}
        warning={t("end_users.new_password_warning", {
          defaultValue: "请立即复制新密码，关闭后将无法再次查看。",
        })}
      />

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
          defaultValue: "管理该用户账号下的 API 密钥（名称、启停、默认密钥等）。限额与权限请在账号编辑中配置。",
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
