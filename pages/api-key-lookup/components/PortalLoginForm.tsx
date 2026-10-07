import { useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2, UserRound } from "lucide-react";
import { LogoMark } from "@code-proxy/assets";
import { Callout, FormField, TextInput, rules, useFormValidation } from "@code-proxy/ui";
import { LandingButton } from "./landing/LandingButton";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * 门户登录表单。
 *
 * 从页面里抽出来单独成组件，一是登录弹窗是访客见到的第一个交互界面，值得单独打磨；
 * 二是这段表单原先散在 1800 行的页面文件里，改动成本高。
 *
 * 弹窗用 hideHeader：顶部是品牌标识 + 大标题，和落地页同一种语气，不是后台那种图标头。
 * 字段用统一的 FormField；账号、密码为空时在字段下就地提示（失焦或点登录后），
 * 不再把按钮置灰让人猜还差什么。服务端的失败原因放在按钮上方的提示条里。
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
  const formRef = useRef<HTMLFormElement | null>(null);
  const validation = useFormValidation(
    { username, password },
    { username: [rules.required()], password: [rules.required()] },
  );

  const fieldClass = "h-12 rounded-2xl px-4 text-sm";
  const adornmentClass = "text-ink-3";

  return (
    <div>
      <div className="flex flex-col items-center pb-8 text-center">
        <LogoMark size={44} className="mb-5" />
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">
          {t("apikey_lookup.login_title", { defaultValue: "登录" })}
        </h2>
        <p className="mt-2 text-sm text-ink-3">
          {t("apikey_lookup.login_desc", { defaultValue: "使用你的账号登录。" })}
        </p>
      </div>

      <form
        ref={formRef}
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
        <FormField
          label={t("apikey_lookup.username", { defaultValue: "账号" })}
          error={validation.error("username")}
        >
          <TextInput
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
            autoFocus
            className={fieldClass}
            aria-label={t("apikey_lookup.username", { defaultValue: "账号" })}
            placeholder={t("apikey_lookup.username_placeholder", { defaultValue: "请输入账号" })}
            startAdornment={<UserRound size={17} className={adornmentClass} />}
            {...validation.bind("username")}
          />
        </FormField>

        <FormField
          label={t("apikey_lookup.password", { defaultValue: "密码" })}
          error={validation.error("password")}
        >
          <TextInput
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
            className={fieldClass}
            aria-label={t("apikey_lookup.password", { defaultValue: "密码" })}
            placeholder={t("apikey_lookup.password_placeholder", { defaultValue: "请输入密码" })}
            startAdornment={<KeyRound size={17} className={adornmentClass} />}
            endAdornment={
              <button
                type="button"
                onClick={onTogglePassword}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-hover hover:text-ink"
                aria-label={
                  showPassword
                    ? t("login.hide_key", { defaultValue: "隐藏密码" })
                    : t("login.show_key", { defaultValue: "显示密码" })
                }
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
            {...validation.bind("password")}
          />
        </FormField>

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
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <LandingButton type="submit" disabled={busy} className="mt-1 h-12 w-full">
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
