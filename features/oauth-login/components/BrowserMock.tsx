import { motion, useReducedMotion } from "framer-motion";
import { ArrowUp, Copy, Info, Lock, MonitorX } from "lucide-react";
import { useTranslation } from "react-i18next";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** How a browser shows an address: no scheme, and the parameters elided. */
export function displayCallbackAddress(
  redirectUri: string | undefined,
  fallbackPath = "/callback",
) {
  if (!redirectUri) return `localhost:····${fallbackPath}?code=···&state=···`;
  try {
    const url = new URL(redirectUri);
    return `${url.host}${url.pathname}?code=···&state=···`;
  } catch {
    return redirectUri;
  }
}

/**
 * A picture of what the browser shows after authorizing, so nobody has to ask
 * where "the callback URL" is.
 *
 * - `redirect`: the provider sends the browser to a localhost address that the
 *   operator's machine does not serve. The page fails to load — that is
 *   expected — and the address bar holds the result. The mock types that
 *   address in and rings the address bar.
 * - `code`: Anthropic's own page shows a code with a copy button; the mock
 *   rings the button.
 */
export function BrowserMock({
  variant,
  address,
  animate,
}: {
  variant: "redirect" | "code";
  address: string;
  /** Play the typing and highlight; off while the step is still upcoming. */
  animate: boolean;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const play = animate && !reduceMotion;
  const secure = variant === "code";

  return (
    <figure className="m-0" aria-label={t("add_account.mock.label")}>
      {/* 一扇窗的示意：窗框是一层淡底，页面区是框里的白底（圆角 12 − 内边距 4 = 8，同一个圆心），
          不再用描边卡片和分隔线画窗户。 */}
      <div className="overflow-hidden rounded-xl bg-subtle p-1">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-ink-4/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-4/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-4/70" />
          </span>
          <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
            {secure ? (
              <Lock size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
            ) : (
              <Info size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
            )}
            <motion.span
              key={`${address}-${play}`}
              className="block min-w-0 truncate font-mono text-xs text-ink"
              initial={play ? { clipPath: "inset(0 100% 0 0)" } : false}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 1.1, ease: "linear", delay: 0.2 }}
            >
              {address}
            </motion.span>
            {variant === "redirect" ? (
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute -inset-0.5 rounded-full shadow-control-focus"
                initial={false}
                animate={play ? { opacity: [0, 1, 0.35, 1] } : { opacity: animate ? 1 : 0 }}
                transition={play ? { duration: 1.6, delay: 1.4, ease: EASE } : { duration: 0 }}
              />
            ) : null}
          </div>
        </div>

        {variant === "redirect" ? (
          <div className="grid justify-items-center gap-0.5 rounded-lg bg-surface px-4 py-4 text-center">
            <MonitorX size={22} className="text-ink-3" aria-hidden="true" />
            <p className="mt-1 text-sm font-semibold text-ink">
              {t("add_account.mock.unreachable_title")}
            </p>
            <p className="text-xs text-ink-3">{t("add_account.mock.unreachable_desc")}</p>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 rounded-lg bg-surface px-4 py-4 text-center">
            <p className="text-sm font-semibold text-ink">{t("add_account.mock.code_title")}</p>
            <div className="flex max-w-full items-center gap-2 rounded-lg bg-subtle px-3 py-2">
              <span className="truncate font-mono text-xs text-ink-2">
                Wq3k8••••••••9xZ#a1b2••••
              </span>
              <span className="relative inline-flex shrink-0 items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-2xs font-medium text-accent-fg">
                <Copy size={11} aria-hidden="true" />
                {t("add_account.mock.copy")}
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-full shadow-control-focus"
                  initial={false}
                  animate={play ? { opacity: [0, 1, 0.35, 1] } : { opacity: animate ? 1 : 0 }}
                  transition={play ? { duration: 1.6, delay: 0.6, ease: EASE } : { duration: 0 }}
                />
              </span>
            </div>
          </div>
        )}
      </div>
      <motion.figcaption
        className={[
          "mt-2 flex items-center gap-1.5 text-xs font-medium",
          animate ? "text-accent-ink colorful:text-sky-700 colorful:dark:text-sky-300" : "text-ink-3",
          variant === "redirect" ? "pl-14" : "justify-center",
        ].join(" ")}
        initial={play ? { opacity: 0, y: -4 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: play ? 1.7 : 0, ease: EASE }}
      >
        <ArrowUp size={13} aria-hidden="true" />
        {variant === "redirect"
          ? t("add_account.mock.copy_address")
          : t("add_account.mock.copy_code")}
      </motion.figcaption>
    </figure>
  );
}
