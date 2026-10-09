import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowBigUpDash, ArrowRight, ChevronDown, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import { detectApiBaseFromLocation } from "@code-proxy/api-client";
import { useAuth } from "@app/providers/AuthProvider";
import {
  Button,
  Callout,
  Checkbox,
  PageBackground,
  TextInput,
  ThemeToggleButton,
  useCapsLock,
  useShake,
  useStaggerVariants,
  useToast,
} from "@code-proxy/ui";
import { BRAND_NAME_PREFIX, BRAND_NAME_SUFFIX, LogoMark } from "@code-proxy/assets";
import {
  isFailureForUsername,
  LoginLockMessage,
  useLoginLockCountdown,
  type LoginFailure,
} from "@features/login-lock";
import { LoginNetwork } from "./LoginNetwork";
import { RotatingModelName } from "./RotatingModelName";
import { describeLoginFailure } from "./loginErrors";

interface RedirectState {
  from?: { pathname?: string };
}

/** 字段标签：输入框聚焦时跟着变深，靠外层 label 上的 `group`。 */
const FIELD_LABEL =
  "block pl-1 text-xs font-medium text-ink-3 transition-colors duration-200 group-focus-within:text-ink";
const FIELD_ICON = "text-ink-4 transition-colors duration-200 group-focus-within:text-ink";
/** 行内提示（大写锁定）的展开收起。 */
const HINT_MOTION = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto" },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] },
} as const;

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state: {
      isAuthenticated,
      isRestoring,
      apiBase: persistedBase,
      rememberPassword: persistedRemember,
      principal,
      authFailureCode,
    },
    actions: { login },
  } = useAuth();
  const { notify } = useToast();
  const [apiBase, setApiBase] = useState(persistedBase || detectApiBaseFromLocation());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(persistedRemember);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  /** 上一次登录失败：表单里常驻的「还剩几次 / 锁定倒计时」都从这里来。 */
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const capsLock = useCapsLock();
  const { controls: shakeControls, shake } = useShake();
  const page = useStaggerVariants({ stagger: 0.07 });
  const form = useStaggerVariants({ stagger: 0.045, delay: 0.12 });
  const redirect = useMemo(
    () => (location.state as RedirectState | null)?.from?.pathname ?? "/dashboard",
    [location.state],
  );
  // 锁定和剩余次数都按账号算：换了账号就不拿上一个账号的状态拦人。
  const failureApplies = isFailureForUsername(failure, username);
  const lockSeconds = useLoginLockCountdown(failureApplies ? failure?.lockedUntil : undefined);
  const locked = lockSeconds > 0;
  const remainingAttempts = failureApplies ? failure?.remainingAttempts : undefined;
  const accessFailureMessage =
    authFailureCode === "tenant_expired"
      ? t("login.tenant_expired")
      : authFailureCode === "tenant_suspended"
        ? t("login.tenant_suspended")
        : authFailureCode === "account_disabled" || authFailureCode === "account_locked"
          ? t("login.account_unavailable")
          : authFailureCode
            ? t("login.session_unavailable")
            : "";

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // 按钮已禁用，但在输入框里按回车仍会走到这里；锁定中不再发请求。
      if (locked) {
        shake();
        return;
      }
      const trimmedUsername = username.trim();
      // 必填项没填：提示之外把焦点送回那个输入框，卡片晃一下把视线拉回来。
      if (!trimmedUsername) {
        notify({ type: "error", message: t("login.error_username_required") });
        usernameRef.current?.focus();
        shake();
        return;
      }
      if (!password) {
        notify({ type: "error", message: t("login.error_password_required") });
        passwordRef.current?.focus();
        shake();
        return;
      }
      setLoading(true);
      try {
        const principal = await login({
          apiBase,
          username: trimmedUsername,
          password,
          rememberPassword,
        });
        setFailure(null);
        notify({ type: "success", message: t("login.login_success") });
        navigate(principal.user.must_change_password ? "/change-password" : redirect, {
          replace: true,
          viewTransition: true,
        });
      } catch (error) {
        // 以前这里不传 details，服务端给的「还剩几次」「锁多久」到不了界面，
        // 锁住之后只剩一句「请稍后再试」。
        const next = describeLoginFailure(t, error, { username: trimmedUsername });
        setFailure(next);
        notify({ type: "error", message: next.message });
        shake();
      } finally {
        setLoading(false);
      }
    },
    [apiBase, locked, login, navigate, notify, password, redirect, rememberPassword, shake, t, username],
  );

  if (isRestoring) return null;
  if (isAuthenticated) {
    return (
      <Navigate to={principal?.user.must_change_password ? "/change-password" : redirect} replace />
    );
  }

  return (
    <PageBackground variant="login">
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggleButton className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-2 shadow-control transition-[background-color,box-shadow,color] hover:bg-surface-hover hover:text-ink hover:shadow-control-hover" />
      </div>
      {/* 卡片四周的中继网络：卡片就是网关，线路从两侧接进来。宽屏才出现。 */}
      <LoginNetwork cardRef={cardRef} />
      <motion.div
        className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16"
        variants={page.container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={page.item} className="mb-9 flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-xl font-normal tracking-tight text-ink">
              {BRAND_NAME_PREFIX}
              <span className="font-semibold">{BRAND_NAME_SUFFIX}</span>
            </span>
          </div>
          <h1 className="mt-7 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t("login.hero_prefix")} <RotatingModelName />
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink-3">{t("login.hero_description")}</p>
        </motion.div>
        <motion.div ref={cardRef} variants={page.item} className="w-full max-w-[420px]">
            {/* 登录卡浮在页面上：伪元素细边 + 抬起一档的投影，不画 border。 */}
            <motion.section
              animate={shakeControls}
              className="cp-edge rounded-3xl bg-surface p-7 shadow-lift sm:p-8"
            >
              <div className="mb-7">
                <h2 className="text-2xl font-semibold tracking-tight text-ink">{t("login.sign_in")}</h2>
              </div>
              <motion.form
                className="space-y-5"
                onSubmit={handleSubmit}
                variants={form.container}
                initial="hidden"
                animate="show"
              >
                {/* 会话类提示可能在表单已经入场之后才出现（比如别的标签页登出），不能挂在依次入场的
                    variants 上：晚挂载的子元素会停在 hidden，只留下一块看不见的空白。 */}
                <AnimatePresence initial={false}>
                  {accessFailureMessage ? (
                    <motion.div {...HINT_MOTION} className="overflow-hidden">
                      <div className="rounded-2xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                        {accessFailureMessage}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {/* 登录失败后的常驻提示：toast 几秒就消失，还剩几次、还要锁多久得一直留在表单上，
                    直到用户换了账号或者情况变了。toast 本身是 role="alert"，已经替读屏播报过，
                    这里不再设播报角色，免得同一件事念两遍。 */}
                <AnimatePresence initial={false}>
                  {locked ? (
                    <motion.div key="login-locked" {...HINT_MOTION} className="overflow-hidden">
                      <Callout tone="danger">
                        <LoginLockMessage t={t} seconds={lockSeconds} />
                      </Callout>
                    </motion.div>
                  ) : remainingAttempts ? (
                    <motion.div key="login-remaining" {...HINT_MOTION} className="overflow-hidden">
                      <Callout tone="warning">
                        {t("login.remaining_attempts_notice", { count: remainingAttempts })}
                      </Callout>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <motion.label variants={form.item} className="group block space-y-2.5">
                  <span className={FIELD_LABEL}>{t("login.username_label", "Username")}</span>
                  <TextInput
                    ref={usernameRef}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                    className="rounded-full px-5"
                    startAdornment={<UserRound size={17} className={FIELD_ICON} />}
                  />
                </motion.label>
                <motion.div variants={form.item}>
                  <label className="group block space-y-2.5">
                    <span className={FIELD_LABEL}>{t("login.password_label", "Password")}</span>
                    <TextInput
                      ref={passwordRef}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={capsLock.onKeyDown}
                      onKeyUp={capsLock.onKeyUp}
                      onBlur={capsLock.onBlur}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="rounded-full px-5"
                      startAdornment={<KeyRound size={17} className={FIELD_ICON} />}
                      endAdornment={
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="relative flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                          aria-label={showPassword ? t("login.hide_key") : t("login.show_key")}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={showPassword ? "hide" : "show"}
                              initial={{ opacity: 0, scale: 0.7, rotate: -20 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.7, rotate: 20 }}
                              transition={{ duration: 0.14 }}
                              className="flex"
                            >
                              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </motion.span>
                          </AnimatePresence>
                        </button>
                      }
                    />
                  </label>
                  {/* 提示放在 label 外面：放进去会改变输入框的可访问名称。 */}
                  <AnimatePresence initial={false}>
                    {capsLock.capsLock ? (
                      <motion.p
                        {...HINT_MOTION}
                        role="status"
                        className="overflow-hidden"
                      >
                        <span className="flex items-center gap-1.5 pt-2 pl-1 text-xs font-medium text-warn">
                          <ArrowBigUpDash size={14} aria-hidden="true" />
                          {t("login.caps_lock_on")}
                        </span>
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
                <motion.label
                  variants={form.item}
                  className="flex cursor-pointer items-center gap-2 text-sm text-ink-2"
                >
                  <Checkbox checked={rememberPassword} onCheckedChange={setRememberPassword} />
                  {t("login.remember_password_label")}
                </motion.label>
                <motion.div variants={form.item}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((value) => !value)}
                    aria-expanded={showAdvanced}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-3 transition-colors hover:text-ink"
                  >
                    {t("login.advanced_connection", "Advanced connection settings")}
                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      className={`transition-transform duration-200 ease-soft ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {showAdvanced ? (
                      <motion.div {...HINT_MOTION} className="overflow-hidden">
                        <div className="pt-3">
                          <TextInput
                            value={apiBase}
                            onChange={(event) => setApiBase(event.target.value)}
                            type="url"
                            aria-label={t("login.endpoint_label")}
                            className="rounded-full px-5"
                          />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
                <motion.div variants={form.item}>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={loading}
                    disabled={locked}
                    className="group h-12 w-full"
                  >
                    {loading ? (
                      t("login.signing_in")
                    ) : (
                      <>
                        {t("login.submit_button")}
                        <ArrowRight
                          size={16}
                          aria-hidden="true"
                          className="transition-transform duration-200 ease-soft group-hover:translate-x-0.5"
                        />
                      </>
                    )}
                  </Button>
                </motion.div>
              </motion.form>
            </motion.section>
        </motion.div>
      </motion.div>
    </PageBackground>
  );
}
