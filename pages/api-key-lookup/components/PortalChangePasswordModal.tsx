import type { Dispatch, SetStateAction } from "react";
import { Button, Modal, TextInput } from "@code-proxy/ui";
import { validatePasswordField } from "@features/password-policy";

const PORTAL_PASSWORD_ERROR_ID = "portal-change-password-error";

export type PortalPasswordForm = { current: string; next: string };

/**
 * Portal change-password dialog. Split out of ApiKeyLookupPage so the page keeps
 * shrinking under the file-size gate; the submit flow stays with the page,
 * which owns the session state it has to update.
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
  // Live policy check. The save button used to gate on an 8-character minimum,
  // which stopped matching the server once portal accounts adopted the identity
  // password policy — leaving the server's English rejection as the only signal
  // that the password was too weak.
  const policyError = form.next ? validatePasswordField(form.next, t) : "";

  return (
    <Modal
      open={open}
      title={t("apikey_lookup.change_password", { defaultValue: "修改密码" })}
      maxWidth="max-w-md"
      onClose={() => {
        // Force password change: only allow close after success clears the flag.
        if (forced) return;
        onClose();
      }}
      footer={
        <>
          {!forced ? (
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
          ) : null}
          <Button
            variant="primary"
            disabled={!form.current || !form.next || Boolean(policyError) || busy}
            onClick={onSubmit}
          >
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-white/75">
            {t("apikey_lookup.current_password", { defaultValue: "当前密码" })}
          </span>
          <TextInput
            type="password"
            value={form.current}
            onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))}
            autoComplete="current-password"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-white/75">
            {t("apikey_lookup.new_password", { defaultValue: "新密码" })}
          </span>
          <TextInput
            type="password"
            value={form.next}
            onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))}
            autoComplete="new-password"
            placeholder={t("apikey_lookup.new_password_hint", {
              defaultValue: "至少 12 位，含大写、小写与特殊字符",
            })}
            invalid={Boolean(policyError)}
            aria-describedby={policyError ? PORTAL_PASSWORD_ERROR_ID : undefined}
          />
          {policyError ? (
            <p
              id={PORTAL_PASSWORD_ERROR_ID}
              role="alert"
              className="text-xs text-rose-600 dark:text-rose-400"
            >
              {policyError}
            </p>
          ) : null}
        </label>
        {error ? <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      </form>
    </Modal>
  );
}
