import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { LockKeyhole } from "lucide-react";
import {
  Button,
  Callout,
  FormField,
  Modal,
  TextInput,
  rules,
  useFormValidation,
} from "@code-proxy/ui";
import { passwordRules } from "@features/identity-rules";

const FORM_ID = "portal-change-password-form";

export type PortalPasswordForm = { current: string; next: string };

/**
 * Portal change-password dialog. Split out of ApiKeyLookupPage so the page keeps
 * shrinking under the file-size gate; the submit flow stays with the page,
 * which owns the session state it has to update.
 *
 * 密码策略常驻在新密码下方（以前只写在占位文字里，一输入就看不见了）；「确认新密码」
 * 只在前端核对两次输入一致，提交给接口的仍然只有当前密码和新密码。
 * 强制改密（首次登录 / 管理员重置后）时不能关掉弹窗：Esc 和点遮罩只会让面板轻晃，
 * 顶部提示说明原因；右上角的关闭按钮 Modal 目前不能隐藏，点了会把提示换成醒目的
 * 琥珀色并重新播报，而不是毫无反应。
 */
export function PortalChangePasswordModal({
  t,
  open,
  form,
  setForm,
  error,
  busy,
  forced,
  onSubmit,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  form: PortalPasswordForm;
  setForm: Dispatch<SetStateAction<PortalPasswordForm>>;
  /** Server-side failure text, already localized by the caller. */
  error: string | null;
  busy: boolean;
  /** A must-change-password session cannot dismiss the dialog. */
  forced: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [confirm, setConfirm] = useState("");
  const [closeBlocked, setCloseBlocked] = useState(false);
  // Policy check. The save button used to gate on an 8-character minimum,
  // which stopped matching the server once portal accounts adopted the identity
  // password policy — leaving the server's English rejection as the only signal
  // that the password was too weak. The domain validator's failure codes double
  // as `validation.*` message keys.
  const validation = useFormValidation(
    { current: form.current, next: form.next, confirm },
    {
      current: [rules.required()],
      next: passwordRules,
      // 只在前端核对两次输入一致，接口仍然只收当前密码和新密码。
      confirm: [
        rules.required(),
        rules.custom<string>((value) => value === form.next || "password_mismatch"),
      ],
    },
  );
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    reset();
    setConfirm("");
    setCloseBlocked(false);
  }, [open, reset]);

  return (
    <Modal
      open={open}
      title={t("apikey_lookup.change_password", { defaultValue: "修改密码" })}
      description={t("apikey_lookup.change_password_desc")}
      icon={<LockKeyhole />}
      size="sm"
      // 强制改密时不能关闭：没有关闭按钮，Esc / 点遮罩只会轻晃并亮出原因，只能改完密码离开。
      closable={!forced}
      onBlockedClose={forced ? () => setCloseBlocked(true) : undefined}
      onClose={onClose}
      footer={
        <>
          {!forced ? (
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
          ) : null}
          <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
            {t("apikey_lookup.save_password")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validation.validate()) {
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          onSubmit();
        }}
      >
        {forced ? (
          <Callout
            key={closeBlocked ? "blocked" : "hint"}
            tone={closeBlocked ? "warning" : "info"}
            role={closeBlocked ? "alert" : undefined}
          >
            {t("apikey_lookup.change_password_forced_hint")}
          </Callout>
        ) : null}
        <FormField
          label={t("apikey_lookup.current_password", { defaultValue: "当前密码" })}
          required
          error={validation.error("current")}
        >
          <TextInput
            type="password"
            value={form.current}
            onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
            autoComplete="current-password"
            {...validation.bind("current")}
          />
        </FormField>
        <FormField
          label={t("apikey_lookup.new_password", { defaultValue: "新密码" })}
          required
          description={t("apikey_lookup.new_password_hint", {
            defaultValue: "至少 12 位，含大写、小写与特殊字符",
          })}
          error={validation.error("next")}
        >
          <TextInput
            type="password"
            value={form.next}
            onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
            autoComplete="new-password"
            {...validation.bind("next")}
          />
        </FormField>
        <FormField
          label={t("apikey_lookup.confirm_new_password")}
          required
          error={validation.error("confirm")}
        >
          <TextInput
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            {...validation.bind("confirm")}
          />
        </FormField>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
      </form>
    </Modal>
  );
}
