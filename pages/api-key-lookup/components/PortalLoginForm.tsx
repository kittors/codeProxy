import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2, UserRound } from "lucide-react";
import { LogoMark } from "@code-proxy/assets";
import { TextInput } from "@code-proxy/ui";
import { LandingButton } from "./landing/LandingButton";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * 门户登录表单。
 *
 * 从页面里抽出来单独成组件，一是登录弹窗是访客见到的第一个交互界面，值得单独打磨；
 * 二是这段表单原先散在 1800 行的页面文件里，改动成本高。
 */
export function PortalLoginForm({
  t,
  username,
  password,
  showPassword,
  error,
  busy,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onSubmit,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  username: string;
  password: string;
  showPassword: boolean;
  error: string | null;
  busy: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const canSubmit = !busy && Boolean(username.trim()) && Boolean(password);

  const fieldClass = "h-12 rounded-2xl px-4 text-sm";
  const labelClass =
    "font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate-400 dark:text-white/40";

  return (
    <div>
      <div className="flex flex-col items-center pb-8 text-center">
        <LogoMark size={44} className="mb-5" />
        <h2 className="font-display text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          {t("apikey_lookup.login_title", { defaultValue: "登录" })}
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-white/45">
          {t("apikey_lookup.login_desc", { defaultValue: "使用你的账号登录。" })}
        </p>
      </div>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="block space-y-2">
          <span className={labelClass}>
            {t("apikey_lookup.username", { defaultValue: "账号" })}
          </span>
          <TextInput
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            autoFocus
            className={fieldClass}
            placeholder={t("apikey_lookup.username_placeholder", { defaultValue: "请输入账号" })}
            startAdornment={<UserRound size={17} className="text-slate-400 dark:text-white/35" />}
          />
        </label>

        <label className="block space-y-2">
          <span className={labelClass}>
            {t("apikey_lookup.password", { defaultValue: "密码" })}
          </span>
          <TextInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            className={fieldClass}
            placeholder={t("apikey_lookup.password_placeholder", { defaultValue: "请输入密码" })}
            startAdornment={<KeyRound size={17} className="text-slate-400 dark:text-white/35" />}
            endAdornment={
              <button
                type="button"
                onClick={onTogglePassword}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-slate-900/5 hover:text-slate-700 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/80"
                aria-label={
                  showPassword
                    ? t("login.hide_key", { defaultValue: "隐藏密码" })
                    : t("login.show_key", { defaultValue: "显示密码" })
                }
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </label>

        {/* 错误条用高度动画展开，避免它突然出现把按钮顶下去 */}
        <AnimatePresence initial={false}>
          {error ? (
            <motion.div
              key="login-error"
              initial={reduceMotion ? false : { opacity: 0, height: 0, y: -4 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="overflow-hidden"
            >
              <p
                role="alert"
                className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-500/15 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20"
              >
                {error}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <LandingButton type="submit" disabled={!canSubmit} className="h-12 w-full">
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              {t("common.loading", { defaultValue: "登录中…" })}
            </>
          ) : (
            t("common.login", { defaultValue: "登录" })
          )}
        </LandingButton>
      </form>
    </div>
  );
}
