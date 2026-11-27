import { ArrowUp, Copy, Info, Lock, MonitorX } from "@code-proxy/ui/icons";
import { usePrefersReducedMotion } from "@code-proxy/ui";
import { useTranslation } from "react-i18next";

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
  const reduceMotion = usePrefersReducedMotion();
  const play = animate && !reduceMotion;
  const secure = variant === "code";

  return (
    <figure className="m-0" aria-label={t("add_account.mock.label")}>
      {/* 一扇窗的示意：窗框是一层淡底，页面区是框里的白底（圆角 12 − 内边距 4 = 8，同一个圆心），
          不再用描边卡片和分隔线画窗户。 */}
      <div className="overflow-hidden rounded-xl bg-sn-subtle p-1">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span className="flex shrink-0 gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-sn-label-off/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-sn-label-off/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-sn-label-off/70" />
          </span>
          <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-sn-raised px-3 py-1.5">
            {secure ? (
              <Lock size={12} className="shrink-0 text-sn-label3" aria-hidden="true" />
            ) : (
              <Info size={12} className="shrink-0 text-sn-label3" aria-hidden="true" />
            )}
            <span
              key={`${address}-${play}`}
              className={`block min-w-0 truncate font-mono text-xs text-sn-label ${play ? "sn-fade-up" : ""}`}
            >
              {address}
            </span>
            {variant === "redirect" ? (
              <span
                aria-hidden="true"
                className={[
                  "pointer-events-none absolute -inset-0.5 rounded-full border border-sn-focus shadow-[0_0_0_3px_var(--sn-ring)] transition-opacity duration-500",
                  animate ? "opacity-100" : "opacity-0",
                  play ? "animate-pulse" : "",
                ].join(" ")}
              />
            ) : null}
          </div>
        </div>

        {variant === "redirect" ? (
          <div className="grid justify-items-center gap-0.5 rounded-lg bg-sn-raised px-4 py-4 text-center">
            <MonitorX size={22} className="text-sn-label3" aria-hidden="true" />
            <p className="mt-1 text-sm font-semibold text-sn-label">
              {t("add_account.mock.unreachable_title")}
            </p>
            <p className="text-xs text-sn-label3">{t("add_account.mock.unreachable_desc")}</p>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 rounded-lg bg-sn-raised px-4 py-4 text-center">
            <p className="text-sm font-semibold text-sn-label">{t("add_account.mock.code_title")}</p>
            <div className="flex max-w-full items-center gap-2 rounded-lg bg-sn-subtle px-3 py-2">
              <span className="truncate font-mono text-xs text-sn-label2">
                Wq3k8••••••••9xZ#a1b2••••
              </span>
              <span className="relative inline-flex shrink-0 items-center gap-1 rounded-full bg-sn-accent px-2.5 py-1 text-2xs font-medium text-sn-on-primary">
                <Copy size={11} aria-hidden="true" />
                {t("add_account.mock.copy")}
                <span
                  aria-hidden="true"
                  className={[
                    "pointer-events-none absolute -inset-1 rounded-full border border-sn-focus shadow-[0_0_0_3px_var(--sn-ring)] transition-opacity duration-500",
                    animate ? "opacity-100" : "opacity-0",
                    play ? "animate-pulse" : "",
                  ].join(" ")}
                />
              </span>
            </div>
          </div>
        )}
      </div>
      <figcaption
        className={[
          "mt-2 flex items-center gap-1.5 text-xs font-medium",
          animate ? "text-sn-accent-ink colorful:text-sky-700 colorful:dark:text-sky-300" : "text-sn-label3",
          variant === "redirect" ? "pl-14" : "justify-center",
          play ? "sn-fade-up" : "",
        ].join(" ")}
      >
        <ArrowUp size={13} aria-hidden="true" />
        {variant === "redirect"
          ? t("add_account.mock.copy_address")
          : t("add_account.mock.copy_code")}
      </figcaption>
    </figure>
  );
}
