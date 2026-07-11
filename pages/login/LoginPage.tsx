import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, UserRound } from "lucide-react";
import { detectApiBaseFromLocation } from "@code-proxy/api-client";
import { useAuth } from "@app/providers/AuthProvider";
import { PageBackground, Reveal, TextInput, ThemeToggleButton, useToast } from "@code-proxy/ui";
import { OpenAILogo, GeminiLogo, ClaudeLogo, VertexLogo } from "@code-proxy/assets";

interface RedirectState {
  from?: { pathname?: string };
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
  const redirect = useMemo(
    () => (location.state as RedirectState | null)?.from?.pathname ?? "/dashboard",
    [location.state],
  );
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
      if (!username.trim() || !password) {
        notify({ type: "error", message: t("login.error_required") });
        return;
      }
      setLoading(true);
      try {
        const principal = await login({ apiBase, username, password, rememberPassword });
        notify({ type: "success", message: t("login.login_success") });
        navigate(principal.user.must_change_password ? "/change-password" : redirect, {
          replace: true,
          viewTransition: true,
        });
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("login.error_invalid"),
        });
      } finally {
        setLoading(false);
      }
    },
    [apiBase, login, navigate, notify, password, redirect, rememberPassword, t, username],
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
        <ThemeToggleButton className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <Reveal className="w-full">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <aside className="space-y-10">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/60 dark:ring-neutral-800">
                  <Lock size={18} className="text-slate-900 dark:text-white" />
                </div>
                <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  Code Proxy
                </div>
              </div>
              <div className="space-y-6">
                <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl dark:text-white">
                  {t("login.hero_title_line1")}
                  <br />
                  {t("login.hero_title_line2")}
                </h1>
                <p className="max-w-xl text-sm leading-7 text-slate-600 dark:text-white/70">
                  {t("login.hero_description")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-700 dark:text-white/80">
                {[OpenAILogo, GeminiLogo, ClaudeLogo, VertexLogo].map((Logo, index) => (
                  <span
                    key={index}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5"
                  >
                    <Logo size={22} />
                  </span>
                ))}
              </div>
            </aside>
            <section className="rounded-[2rem] border border-white/70 bg-white/75 p-3 shadow-2xl shadow-slate-300/30 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/70 dark:shadow-black/30">
              <div className="rounded-[1.6rem] border border-slate-200/80 bg-white p-7 sm:p-9 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="mb-8 space-y-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                    {t("login.sign_in")}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-white/55">
                    {t(
                      "login.account_login_hint",
                      "Use your account credentials. Your tenant is resolved automatically.",
                    )}
                  </p>
                </div>
                <form className="space-y-5" onSubmit={handleSubmit}>
                  {accessFailureMessage ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                      {accessFailureMessage}
                    </div>
                  ) : null}
                  <label className="block space-y-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                      {t("login.username_label", "Username")}
                    </span>
                    <TextInput
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      autoComplete="username"
                      autoFocus
                      className="rounded-full px-5 py-3"
                      startAdornment={<UserRound size={16} />}
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                      {t("login.password_label", "Password")}
                    </span>
                    <TextInput
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="rounded-full px-5 py-3"
                      endAdornment={
                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                          aria-label={showPassword ? t("login.hide_key") : t("login.show_key")}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      }
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-white/70">
                    <input
                      type="checkbox"
                      checked={rememberPassword}
                      onChange={(event) => setRememberPassword(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    {t("login.remember_password_label")}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((value) => !value)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                  >
                    {t("login.advanced_connection", "Advanced connection settings")}
                  </button>
                  {showAdvanced ? (
                    <TextInput
                      value={apiBase}
                      onChange={(event) => setApiBase(event.target.value)}
                      type="url"
                      className="rounded-full px-5 py-3"
                    />
                  ) : null}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 dark:bg-white/10 dark:hover:bg-white/15"
                  >
                    {loading ? t("login.signing_in") : t("login.submit_button")}
                  </button>
                </form>
              </div>
            </section>
          </div>
        </Reveal>
      </div>
    </PageBackground>
  );
}
