import { useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowBigUpDash, ArrowLeft, Check, Shield, ShieldCheck, X } from "@code-proxy/ui/icons";
import { passwordRuleStatus } from "@code-proxy/domain";
import { identityApi } from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
  PageBackground,
  TextInput,
  ThemeToggleButton,
  useCapsLock,
  useToast,
} from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";
import { resolvePasswordApiError, validatePasswordField } from "@features/password-policy";
import { PasswordChecklist } from "./PasswordChecklist";

const NEW_PASSWORD_ERROR_ID = "change-password-new-error";
const NEW_PASSWORD_RULES_ID = "change-password-rules";
const CONFIRM_HINT_ID = "change-password-confirm-hint";

const FIELD_LABEL =
  "block pl-1 text-xs font-medium text-ink-3 transition-colors duration-200 group-focus-within:text-ink";

type ConfirmState = "empty" | "typing" | "match" | "mismatch";

/** 确认框还是新密码的前缀时视为「还在输入」，不急着报不一致。 */
function resolveConfirmState(newPassword: string, confirm: string): ConfirmState {
  if (!confirm) return "empty";
  if (confirm === newPassword) return "match";
  return newPassword.startsWith(confirm) ? "typing" : "mismatch";
}

function triggerSatinShake(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("sn-shake");
  void el.offsetWidth;
  el.classList.add("sn-shake");
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useToast();
  const { t } = useTranslation();
  const {
    state: { principal },
    actions: { restore },
  } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const capsLock = useCapsLock();
  const sectionRef = useRef<HTMLElement>(null);
  const shake = useCallback(() => triggerSatinShake(sectionRef.current), []);

  const forced = Boolean(principal?.user.must_change_password);
  const confirmState = resolveConfirmState(newPassword, confirm);
  const ready =
    Object.values(passwordRuleStatus(newPassword)).every(Boolean) && confirmState === "match";
  const passwordFieldProps = {
    type: showPasswords ? "text" : "password",
    size: "lg" as const,
    onKeyDown: capsLock.onKeyDown,
    onKeyUp: capsLock.onKeyUp,
    onBlur: capsLock.onBlur,
  };

  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/dashboard", { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const localError = validatePasswordField(newPassword, t);
    if (localError) {
      setPasswordError(localError);
      shake();
      return;
    }
    if (newPassword !== confirm) {
      notify({ type: "error", message: t("identity_admin.passwords_do_not_match") });
      shake();
      return;
    }
    setPasswordError("");
    setLoading(true);
    try {
      await identityApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      await restore();
      notify({ type: "success", message: t("identity_admin.password_changed") });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      shake();
      const policy = resolvePasswordApiError(error, t);
      if (policy) {
        setPasswordError(policy);
        setLoading(false);
        return;
      }
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("identity_admin.password_change_failed"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageBackground variant="login">
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggleButton variant="secondary" size="lg" />
      </div>
      <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12">
        <div className="sn-fade-up w-full max-w-md">
          <section
            ref={sectionRef}
            className="cp-edge relative rounded-2xl bg-[var(--sn-raised)] p-7 shadow-lift sm:p-9"
          >
            {forced ? null : (
              <button
                type="button"
                onClick={goBack}
                className="sn-btn sn-ghost sn-sm !absolute top-5 left-5 text-[var(--sn-label3)]"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                {t("common.back")}
              </button>
            )}
            <div className="mb-8 text-center">
              <div
                className={[
                  "mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-colors duration-200",
                  ready
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300"
                    : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
                ].join(" ")}
              >
                <span className={ready ? "sn-swap sn-on" : "sn-swap"}>
                  <span className="sn-a">
                    <Shield size={22} aria-hidden="true" />
                  </span>
                  <span className="sn-b">
                    <ShieldCheck size={22} aria-hidden="true" />
                  </span>
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                {t("identity_admin.change_password")}
              </h1>
              <p className="mt-2 text-sm text-ink-3">
                {t(
                  forced
                    ? "identity_admin.change_password_forced_hint"
                    : "identity_admin.change_password_hint",
                )}
              </p>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <label className="group block space-y-2.5">
                <span className={FIELD_LABEL}>{t("identity_admin.current_password")}</span>
                <TextInput
                  {...passwordFieldProps}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <div className="h-1" aria-hidden="true" />

              <div>
                <label className="group block space-y-2.5">
                  <span className={FIELD_LABEL}>{t("identity_admin.new_password")}</span>
                  <TextInput
                    {...passwordFieldProps}
                    value={newPassword}
                    onChange={(event) => {
                      setNewPassword(event.target.value);
                      if (passwordError) setPasswordError("");
                    }}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    invalid={Boolean(passwordError)}
                    aria-describedby={[NEW_PASSWORD_RULES_ID, passwordError ? NEW_PASSWORD_ERROR_ID : ""]
                      .filter(Boolean)
                      .join(" ")}
                  />
                </label>
                <PasswordChecklist id={NEW_PASSWORD_RULES_ID} password={newPassword} t={t} />
                {passwordError ? (
                  <p
                    id={NEW_PASSWORD_ERROR_ID}
                    role="alert"
                    className="pt-2 text-xs text-err"
                  >
                    {passwordError}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="group block space-y-2.5">
                  <span className={FIELD_LABEL}>{t("identity_admin.confirm_new_password")}</span>
                  <TextInput
                    {...passwordFieldProps}
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    invalid={confirmState === "mismatch"}
                    aria-describedby={confirmState === "match" || confirmState === "mismatch" ? CONFIRM_HINT_ID : undefined}
                  />
                </label>
                {confirmState === "match" || confirmState === "mismatch" ? (
                  <p key={confirmState} id={CONFIRM_HINT_ID} className="sn-fade-up overflow-hidden">
                    <span
                      className={[
                        "flex items-center gap-1.5 pt-2 pl-1 text-xs font-medium",
                        confirmState === "match" ? "text-ok" : "text-err",
                      ].join(" ")}
                    >
                      {confirmState === "match" ? (
                        <Check size={13} strokeWidth={2.5} aria-hidden="true" />
                      ) : (
                        <X size={13} strokeWidth={2.5} aria-hidden="true" />
                      )}
                      {t(
                        confirmState === "match"
                          ? "identity_admin.passwords_match"
                          : "identity_admin.passwords_do_not_match",
                      )}
                    </span>
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                  <Checkbox checked={showPasswords} onCheckedChange={setShowPasswords} />
                  {t(
                    showPasswords ? "identity_admin.hide_passwords" : "identity_admin.show_passwords",
                  )}
                </label>
                {capsLock.capsLock ? (
                  <p role="status" className="sn-fade-up overflow-hidden">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-warn">
                      <ArrowBigUpDash size={14} aria-hidden="true" />
                      {t("login.caps_lock_on")}
                    </span>
                  </p>
                ) : null}
              </div>

              <div>
                <Button type="submit" variant="primary" loading={loading} className="h-11 w-full">
                  {loading ? t("identity_admin.saving") : t("identity_admin.save_password")}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </PageBackground>
  );
}
