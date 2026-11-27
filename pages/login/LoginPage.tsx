import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowBigUpDash } from "@code-proxy/ui/icons";
import { Icon } from "satin-ui/react";
import { detectApiBaseFromLocation } from "@code-proxy/api-client";
import { useAuth } from "@app/providers/AuthProvider";
import {
  Button,
  Callout,
  Checkbox,
  GitHubRepoLink,
  PageBackground,
  TextInput,
  ThemeToggleButton,
  useCapsLock,
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
  "block pl-1 text-xs font-medium text-sn-label3 transition-colors duration-200 group-focus-within:text-sn-label";
const FIELD_ICON = "text-sn-label-off transition-colors duration-200 group-focus-within:text-sn-label";

function triggerSatinShake(el: HTMLElement | null) {
  if (!el) return;
  el.classList.remove("sn-shake");
  void el.offsetWidth;
  el.classList.add("sn-shake");
}

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
  const sectionRef = useRef<HTMLElement>(null);
  const capsLock = useCapsLock();
  const shake = useCallback(() => triggerSatinShake(sectionRef.current), []);
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
      if (locked) {
        shake();
        return;
      }
      const trimmedUsername = username.trim();
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
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        <GitHubRepoLink variant="pill" size="lg" />
        <ThemeToggleButton variant="secondary" size="lg" />
      </div>
      {/* 卡片四周的中继网络：卡片就是网关，线路从两侧接进来。宽屏才出现。 */}
      <LoginNetwork cardRef={cardRef} />
      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-16">
        <div className="sn-fade-up mb-9 flex flex-col items-center text-center">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="text-xl font-normal tracking-tight text-sn-label">
              {BRAND_NAME_PREFIX}
              <span className="font-semibold">{BRAND_NAME_SUFFIX}</span>
            </span>
          </div>
          <h1 className="mt-7 text-3xl font-semibold tracking-tight text-sn-label sm:text-4xl">
            {t("login.hero_prefix")} <RotatingModelName />
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-sn-label3">{t("login.hero_description")}</p>
          <div className="mt-4">
            <GitHubRepoLink variant="badge" />
          </div>
        </div>
        <div
          ref={cardRef}
          className="sn-fade-up w-full max-w-[420px]"
          style={{ animationDelay: "70ms" }}
        >
          {/* 登录卡对齐 Satin .sn-auth 表面：16px 清晰圆角、1px 细描边与干净抬升投影。 */}
          <section
            ref={sectionRef}
            className="border border-sn-line rounded-2xl bg-[var(--sn-raised)] p-7 shadow-sn-lift sm:p-8"
          >
            <div className="mb-7">
              <h2 className="text-2xl font-semibold tracking-tight text-sn-label">{t("login.sign_in")}</h2>
            </div>
            <form className="space-y-5" onSubmit={handleSubmit}>
              {accessFailureMessage ? (
                <div className="sn-fade-up overflow-hidden">
                  <Callout tone="warning">{accessFailureMessage}</Callout>
                </div>
              ) : null}
              {locked ? (
                <div key="login-locked" className="sn-fade-up overflow-hidden">
                  <Callout tone="danger">
                    <LoginLockMessage t={t} seconds={lockSeconds} />
                  </Callout>
                </div>
              ) : remainingAttempts ? (
                <div key="login-remaining" className="sn-fade-up overflow-hidden">
                  <Callout tone="warning">
                    {t("login.remaining_attempts_notice", { count: remainingAttempts })}
                  </Callout>
                </div>
              ) : null}
              <label className="group block space-y-2.5">
                <span className={FIELD_LABEL}>{t("login.username_label", "Username")}</span>
                <TextInput
                  ref={usernameRef}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  size="xl"
                  startAdornment={<Icon name="user" size={16} className={FIELD_ICON} />}
                />
              </label>
              <div>
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
                    size="xl"
                    startAdornment={<Icon name="key-round" size={16} className={FIELD_ICON} />}
                    endAdornment={
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="sn-eye"
                        aria-label={showPassword ? t("login.hide_key") : t("login.show_key")}
                      >
                        <span className={showPassword ? "sn-swap sn-on" : "sn-swap"}>
                          <span className="sn-a">
                            <Icon name="eye" size={16} />
                          </span>
                          <span className="sn-b">
                            <Icon name="eye-off" size={16} />
                          </span>
                        </span>
                      </button>
                    }
                  />
                </label>
                {/* 提示放在 label 外面：放进去会改变输入框的可访问名称。 */}
                {capsLock.capsLock ? (
                  <p role="status" className="sn-fade-up overflow-hidden">
                    <span className="flex items-center gap-1.5 pt-2 pl-1 text-xs font-medium text-warn">
                      <ArrowBigUpDash size={14} aria-hidden="true" />
                      {t("login.caps_lock_on")}
                    </span>
                  </p>
                ) : null}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-sn-label2">
                <Checkbox checked={rememberPassword} onCheckedChange={setRememberPassword} />
                {t("login.remember_password_label")}
              </label>
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((value) => !value)}
                  aria-expanded={showAdvanced}
                  className="sn-btn sn-ghost sn-xs -ml-2 text-[var(--sn-label3)]"
                >
                  {t("login.advanced_connection", "Advanced connection settings")}
                  <Icon
                    name="chevron-down"
                    size={14}
                    className={`transition-transform duration-200 ease-[var(--sn-ease-out-strong)] ${showAdvanced ? "rotate-180" : ""}`}
                  />
                </button>
                {showAdvanced ? (
                  <div className="sn-fade-up overflow-hidden pt-3">
                    <TextInput
                      value={apiBase}
                      onChange={(event) => setApiBase(event.target.value)}
                      type="url"
                      size="lg"
                      aria-label={t("login.endpoint_label")}
                    />
                  </div>
                ) : null}
              </div>
              <div>
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
                      <Icon
                        name="arrow-right"
                        size={16}
                        className="transition-transform duration-200 ease-[var(--sn-ease-out-strong)] group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </PageBackground>
  );
}
