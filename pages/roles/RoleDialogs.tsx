import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Lock, Search, ShieldCheck, ShieldPlus, UserRoundCog } from "lucide-react";
import type { RoleIdentity, UserIdentity } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  CheckboxField,
  ConfirmModal,
  EmptyState,
  FormField,
  Modal,
  Skeleton,
  TextInput,
  Textarea,
  rules,
  useFormValidation,
} from "@code-proxy/ui";

const ROLE_NAME_MAX_BYTES = 128;
const ROLE_DESCRIPTION_MAX_BYTES = 1000;
/** 字数提示按服务端的口径数：UTF-8 字节（Go 的 len），一个汉字算 3 个字节。 */
const utf8Length = (value: string) => new TextEncoder().encode(value.trim()).length;

export type RoleForm = { name: string; description: string };
const emptyRoleForm = (): RoleForm => ({ name: "", description: "" });

/** 新建角色：只填名称和描述，权限与成员在列表里分别配置（服务端创建时权限为空）。 */
export function CreateRoleModal({
  open,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  onSubmit: (form: RoleForm) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyRoleForm);
  const validation = useFormValidation(form, {
    name: [rules.required(), rules.maxBytes(ROLE_NAME_MAX_BYTES)],
    description: [rules.maxBytes(ROLE_DESCRIPTION_MAX_BYTES)],
  });
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    setForm(emptyRoleForm());
    reset();
  }, [open, reset]);

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit({ name: form.name.trim(), description: form.description.trim() });
  };

  return (
    <Modal
      open={open}
      title={t("identity_admin.new_role")}
      description={t("identity_admin.new_role_desc")}
      icon={<ShieldPlus />}
      size="md"
      onClose={onClose}
      onSubmitShortcut={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="create-role-form" variant="primary" loading={busy}>
            {t("identity_admin.create_role")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="create-role-form"
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormField
          label={t("identity_admin.role_name")}
          required
          description={t("identity_admin.role_name_hint")}
          error={validation.error("name")}
          maxLength={ROLE_NAME_MAX_BYTES}
          valueLength={utf8Length(form.name)}
        >
          <TextInput
            value={form.name}
            autoComplete="off"
            {...validation.bind("name")}
            onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
          />
        </FormField>
        <FormField
          label={t("identity_admin.description")}
          optional
          description={t("identity_admin.role_description_hint")}
          error={validation.error("description")}
        >
          <Textarea
            value={form.description}
            rows={3}
            {...validation.bind("description")}
            onChange={(event) =>
              setForm((previous) => ({ ...previous, description: event.target.value }))
            }
          />
        </FormField>
      </form>
    </Modal>
  );
}

/**
 * 角色权限树。受保护角色、或当前操作者没有「修改角色」权限时只能查看——以前只是底部按钮
 * 变成「关闭」、勾选框全灰，现在在树上方说明为什么只能看。
 */
export function RolePermissionsModal({
  role,
  title,
  readOnlyReason,
  selectedCount,
  busy,
  onSave,
  onClose,
  children,
}: {
  role: RoleIdentity | null;
  title: string;
  /** 只读原因；null 表示可以编辑。 */
  readOnlyReason: string | null;
  selectedCount: number;
  busy: boolean;
  onSave: () => void;
  onClose: () => void;
  /** 权限树本身（由页面组装节点）。 */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={role !== null}
      title={title}
      description={t("identity_admin.role_permissions_description")}
      icon={<ShieldCheck />}
      size="xl"
      bodyHeightClassName="max-h-[66vh]"
      onClose={onClose}
      footerStart={t("identity_admin.permissions_selected", { count: selectedCount })}
      footer={
        readOnlyReason ? (
          <Button onClick={onClose}>{t("common.close")}</Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy} onClick={onSave}>
              {t("identity_admin.save_permissions")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {readOnlyReason ? (
          <Callout tone="neutral" icon={<Lock />}>
            {readOnlyReason}
          </Callout>
        ) : null}
        {children}
      </div>
    </Modal>
  );
}

const statusKey = (status: UserIdentity["status"]) =>
  status === "active"
    ? "identity_admin.status_active"
    : status === "locked"
      ? "identity_admin.status_locked"
      : "identity_admin.status_disabled";

/**
 * 给角色分配用户：可搜索（按显示名或用户名），已选人数显示在底部左侧。
 * 超级管理员、租户管理员的角色受保护，勾选框锁定，并在那一行写明原因。
 */
export function AssignRoleUsersModal({
  role,
  title,
  users,
  loading,
  selected,
  isLocked,
  userName,
  busy,
  onChange,
  onSave,
  onClose,
}: {
  role: RoleIdentity | null;
  title: string;
  users: UserIdentity[];
  loading: boolean;
  selected: ReadonlySet<string>;
  isLocked: (user: UserIdentity) => boolean;
  userName: (user: UserIdentity) => string;
  busy: boolean;
  onChange: (next: Set<string>) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (role) setQuery("");
  }, [role]);

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        userName(user).toLowerCase().includes(needle) ||
        user.username.toLowerCase().includes(needle),
    );
  }, [query, userName, users]);

  const toggle = (user: UserIdentity, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(user.id);
    else next.delete(user.id);
    onChange(next);
  };

  let list: ReactNode;
  if (loading && users.length === 0) {
    list = (
      <div className="space-y-2" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} rounded="lg" className="h-[62px] w-full" />
        ))}
      </div>
    );
  } else if (users.length === 0) {
    list = <EmptyState title={t("identity_admin.no_users")} icon={<UserRoundCog size={20} />} />;
  } else if (visibleUsers.length === 0) {
    list = (
      <EmptyState
        title={t("identity_admin.no_matching_users")}
        description={t("identity_admin.no_matching_users_hint")}
        icon={<Search size={20} />}
      />
    );
  } else {
    list = (
      <div className="space-y-2">
        {visibleUsers.map((user) => {
          const locked = isLocked(user);
          const meta = `${user.username} · ${t(statusKey(user.status))}`;
          return (
            <CheckboxField
              key={user.id}
              checked={selected.has(user.id)}
              disabled={locked}
              onCheckedChange={(checked) => toggle(user, checked)}
              label={userName(user)}
              description={locked ? `${meta} · ${t("identity_admin.role_users_locked")}` : meta}
            />
          );
        })}
      </div>
    );
  }

  return (
    <Modal
      open={role !== null}
      title={title}
      description={t("identity_admin.assign_role_users_description")}
      icon={<UserRoundCog />}
      size="md"
      bodyHeightClassName="max-h-[60vh]"
      onClose={onClose}
      footerStart={t("identity_admin.users_selected", { count: selected.size })}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={Boolean(role?.system_protected)}
            onClick={onSave}
          >
            {t("identity_admin.save_role_users")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {users.length > 0 ? (
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("identity_admin.search_users_placeholder")}
            aria-label={t("identity_admin.search_users")}
            startAdornment={<Search size={15} className="text-ink-3" aria-hidden="true" />}
            autoComplete="off"
          />
        ) : null}
        {list}
      </div>
    </Modal>
  );
}

export function DeleteRoleConfirm({
  role,
  name,
  assignedCount,
  busy,
  onConfirm,
  onClose,
}: {
  role: RoleIdentity | null;
  name: string;
  /** 还分配着这个角色的用户数；null 表示无权读取用户列表、不知道。 */
  assignedCount: number | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const consequences = [t("identity_admin.delete_role_consequence_permissions")];
  // 服务端拒绝删除仍有用户在用的角色。知道人数时用下面的提示条说清楚；不知道时放进后果里。
  if (assignedCount === null)
    consequences.push(t("identity_admin.delete_role_consequence_assigned"));
  return (
    <ConfirmModal
      open={role !== null}
      title={t("identity_admin.delete_role_title", { name })}
      description={t("identity_admin.delete_lead")}
      subject={
        role ? (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 text-xs text-ink-3">
              {t("identity_admin.permission_count", { count: role.permissions.length })}
            </span>
          </span>
        ) : null
      }
      consequences={consequences}
      confirmText={t("identity_admin.delete_role")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {assignedCount ? (
        <Callout tone="warning">
          {t("identity_admin.delete_role_assigned_blocked", { count: assignedCount })}
        </Callout>
      ) : null}
    </ConfirmModal>
  );
}
