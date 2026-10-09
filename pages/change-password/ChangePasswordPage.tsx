import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowBigUpDash, ArrowLeft, Check, Shield, ShieldCheck, X } from "lucide-react";
import { passwordRuleStatus } from "@code-proxy/domain";
import { identityApi } from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
  PageBackground,
  TextInput,
  ThemeToggleButton,
  useCapsLock,
  useShake,
  useStaggerVariants,
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
/** 字段下方行内提示的展开收起。 */
const HINT_MOTION = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
} as const;

type ConfirmState = "empty" | "typing" | "match" | "mismatch";

/** 确认框还是新密码的前缀时视为「还在输入」，不急着报不一致。 */
function resolveConfirmState(newPassword: string, confirm: string): ConfirmState {
  if (!confirm) return "empty";
  if (confirm === newPassword) return "match";
  return newPassword.startsWith(confirm) ? "typing" : "mismatch";
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
  const { controls: shakeControls, shake } = useShake();
  const card = useStaggerVariants();
  const form = useStaggerVariants({ stagger: 0.045, delay: 0.12 });

  // 管理员要求改密时路由守卫会把人拦在这一页，不给「返回」；自己从账号菜单进来的才有。
  const forced = Boolean(principal?.user.must_change_password);
  const confirmState = resolveConfirmState(newPassword, confirm);
  const ready =
    Object.values(passwordRuleStatus(newPassword)).every(Boolean) && confirmState === "match";
  const passwordFieldProps = {
    type: showPasswords ? "text" : "password",
    onKeyDown: capsLock.onKeyDown,
    onKeyUp: capsLock.onKeyUp,
    onBlur: capsLock.onBlur,
  };

  const goBack = () => {
    // 直接打开本页（没有站内上一页）时 location.key 是 "default"，退回去会离开面板。
    if (location.key !== "default") navigate(-1);
    else navigate("/dashboard", { replace: true });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // The policy is checked here, not just minLength={12} on the input: the
    // uppercase/lowercase/special rules were previously enforced only by the
    // server, whose rejection this page could render only as an English toast.
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
      // Still translated if the server rejects something the local check let
      // through: client-side validation is a convenience, not the authority.
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
        <ThemeToggleButton className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-control transition-[background-color,box-shadow,color] hover:bg-surface-hover hover:text-ink hover:shadow-control-hover" />
      </div>
      <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12">
        <motion.div
          className="w-full max-w-md"
          variants={card.container}
          initial="hidden"
          animate="show"
        >
          <motion.div variants={card.item}>
            <motion.section
              animate={shakeControls}
              className="cp-edge relative rounded-3xl bg-surface p-7 shadow-lift sm:p-9"
            >
              {forced ? null : (
                <button
                  type="button"
                  onClick={goBack}
                  className="absolute top-5 left-5 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  {t("common.back")}
                </button>
              )}
              <div className="mb-8 text-center">
                {/*
                  规则全部满足、两次输入一致时盾牌打上对勾：不用看清单也知道可以提交了。
                  图标块平时是中性淡底，满足后换成成功的淡绿底——颜色只表达「可以提交了」这个状态，
                  不再常驻一块强调色的实色方块。
                */}
                <div
                  className={[
                    "mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl transition-colors duration-200",
                    ready
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300"
                      : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
                  ].join(" ")}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={ready ? "ready" : "pending"}
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.18, ease: [0.3, 1.25, 0.5, 1] }}
                      className="flex"
                    >
                      {ready ? (
                        <ShieldCheck size={22} aria-hidden="true" />
                      ) : (
                        <Shield size={22} aria-hidden="true" />
                      )}
                    </motion.span>
                  </AnimatePresence>
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

              <motion.form
                className="space-y-5"
                onSubmit={submit}
                variants={form.container}
                initial="hidden"
                animate="show"
              >
                <motion.label variants={form.item} className="group block space-y-2.5">
                  <span className={FIELD_LABEL}>{t("identity_admin.current_password")}</span>
                  <TextInput
                    {...passwordFieldProps}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </motion.label>

                {/* 当前密码与新密码两组之间多留一段空白，不再画分隔线。 */}
                <motion.div variants={form.item} className="h-1" aria-hidden="true" />

                <motion.div variants={form.item}>
                  {/* 清单和错误放在 label 外面：放进去会改变输入框的可访问名称。 */}
                  <label className="group block space-y-2.5">
                    <span className={FIELD_LABEL}>{t("identity_admin.new_password")}</span>
                    <TextInput
                      {...passwordFieldProps}
                      value={newPassword}
                      onChange={(event) => {
                        setNewPassword(event.target.value);
                        // Clear as they type: keeping a stale rule violation on
                        // screen while the field already satisfies it reads as the
                        // form being stuck.
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
                </motion.div>

                <motion.div variants={form.item}>
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
                  <AnimatePresence initial={false} mode="wait">
                    {confirmState === "match" || confirmState === "mismatch" ? (
                      <motion.p key={confirmState} {...HINT_MOTION} id={CONFIRM_HINT_ID} className="overflow-hidden">
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
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </motion.div>

                <motion.div variants={form.item} className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                    <Checkbox checked={showPasswords} onCheckedChange={setShowPasswords} />
                    {t(
                      showPasswords ? "identity_admin.hide_passwords" : "identity_admin.show_passwords",
                    )}
                  </label>
                  <AnimatePresence initial={false}>
                    {capsLock.capsLock ? (
                      <motion.p {...HINT_MOTION} role="status" className="overflow-hidden">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-warn">
                          <ArrowBigUpDash size={14} aria-hidden="true" />
                          {t("login.caps_lock_on")}
                        </span>
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </motion.div>

                <motion.div variants={form.item}>
                  <Button type="submit" variant="primary" loading={loading} className="h-11 w-full">
                    {loading ? t("identity_admin.saving") : t("identity_admin.save_password")}
                  </Button>
                </motion.div>
              </motion.form>
            </motion.section>
          </motion.div>
        </motion.div>
      </main>
    </PageBackground>
  );
}
