import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Button, Modal, TextInput } from "@code-proxy/ui";
import type { EndUserForm } from "../endUserForm";

const CREATE_PASSWORD_ERROR_ID = "end-user-create-password-error";

/**
 * Account creation dialog. Split out of EndUsersPage so the page keeps shrinking
 * under the file-size gate; behaviour is unchanged.
 */
export function EndUserCreateModal({
  t,
  open,
  form,
  setForm,
  busy,
  createPasswordError,
  setCreatePasswordError,
  onSubmit,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  form: EndUserForm;
  setForm: Dispatch<SetStateAction<EndUserForm>>;
  busy: boolean;
  createPasswordError: string;
  setCreatePasswordError: Dispatch<SetStateAction<string>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.create", { defaultValue: "创建用户" })}
      maxWidth="max-w-xl"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
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
      <form id="create-end-user-form" className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.display_name", { defaultValue: "昵称" })}
          </span>
          <TextInput
            value={form.displayName}
            onChange={(e) =>
              setForm((f) => ({ ...f, displayName: e.target.value }))
            }
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.username", { defaultValue: "用户名（可选）" })}
          </span>
          <TextInput
            value={form.username}
            onChange={(e) =>
              setForm((f) => ({ ...f, username: e.target.value }))
            }
            placeholder={t("end_users.username_placeholder")}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.password", { defaultValue: "密码（可选）" })}
          </span>
          <TextInput
            type="password"
            value={form.password}
            onChange={(e) => {
              setForm((f) => ({ ...f, password: e.target.value }));
              if (createPasswordError) setCreatePasswordError("");
            }}
            placeholder={t("end_users.password_placeholder")}
            invalid={Boolean(createPasswordError)}
            aria-describedby={
              createPasswordError ? CREATE_PASSWORD_ERROR_ID : undefined
            }
          />
          {createPasswordError ? (
            <p
              id={CREATE_PASSWORD_ERROR_ID}
              role="alert"
              className="text-xs text-rose-600 dark:text-rose-400"
            >
              {createPasswordError}
            </p>
          ) : null}
        </label>
        <p className="text-xs text-amber-600">
          {t("end_users.password_hint", {
            defaultValue:
              "不填密码将随机生成；生成后只展示一次，哈希后无法再查看。",
          })}
        </p>
      </form>
    </Modal>
  );
}
