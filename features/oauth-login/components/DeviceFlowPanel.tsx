import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client";
import { Button, Step, Steps, type StepState, ScrollFade } from "@code-proxy/ui";
import type { ProxyPoolSelect } from "@features/proxy-pool";
import { useOAuthLogin } from "../hooks/useOAuthLogin";
import type { AccountProvider } from "../model/catalog";
import { copyText } from "../model/clipboard";
import { navigatePendingWindow, openInNewTab, openPendingWindow } from "../model/loginWindow";
import type { StartedLogin } from "../model/startedLogin";
import { LoginOptions, type LoginOptionValues } from "./LoginOptions";
import { LoginStatusBar } from "./LoginStatusBar";

/** The device code, large enough to compare at a glance with the provider's page. */
function UserCode({ code }: { code: string }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [copied, setCopied] = useState(false);
  const characters = code.split("");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        className="flex items-center gap-1 rounded-2xl bg-subtle px-4 py-3"
        aria-label={t("add_account.device.code_label")}
        role="group"
      >
        {characters.map((character, index) => (
          <motion.span
            // Codes can repeat characters, so position is part of the key.
            key={`${index}-${character}`}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : index * 0.035, duration: 0.25 }}
            className={[
              "font-mono text-2xl font-semibold tracking-wider text-ink tabular-nums",
              character === "-" ? "px-0.5 text-ink-3" : "",
            ].join(" ")}
          >
            {character}
          </motion.span>
        ))}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          const ok = await copyText(code);
          setCopied(ok);
          if (ok) window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? t("add_account.steps.copied") : t("add_account.device.copy_code")}
      </Button>
    </div>
  );
}

/**
 * Device login (Qwen, Kimi): the server requests a code, the operator approves
 * it on the provider's page, and the server notices by itself. Nothing is
 * pasted back, so the old "callback URL" box simply does not exist here.
 */
export function DeviceFlowPanel({
  provider,
  providerName,
  options,
  onOptionsChange,
  proxyEntries,
  proxyCheckState,
  onSucceeded,
}: {
  provider: AccountProvider;
  providerName: string;
  options: LoginOptionValues;
  onOptionsChange: (next: Partial<LoginOptionValues>) => void;
  proxyEntries: ProxyPoolEntry[];
  proxyCheckState: ComponentProps<typeof ProxyPoolSelect>["checkState"];
  onSucceeded: (login: StartedLogin) => void;
}) {
  const { t } = useTranslation();
  const { phase, start } = useOAuthLogin({ provider: provider.oauth, onSucceeded });
  const [popupBlocked, setPopupBlocked] = useState(false);

  const login = "login" in phase ? phase.login : undefined;
  const live =
    phase.name === "waiting" || phase.name === "submitting" || phase.name === "finishing";
  const starting = phase.name === "starting";

  const launch = async () => {
    setPopupBlocked(false);
    const pending = openPendingWindow();
    const started = await start({ proxyId: options.proxyId });
    if (!started) {
      pending?.close();
      return;
    }
    if (!navigatePendingWindow(pending, started.url)) setPopupBlocked(true);
  };

  const stepOne: StepState = live ? "done" : "active";
  const stepTwo: StepState = live ? "active" : "upcoming";
  const stepThree: StepState = live ? "active" : "upcoming";

  return (
    <>
      <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <Steps>
          <Step
            index={1}
            state={stepOne}
            title={t("add_account.device.start_title")}
            description={t("add_account.device.start_desc", { provider: providerName })}
          >
            {live ? null : (
              <div className="grid gap-3">
                <div>
                  <Button variant="primary" loading={starting} onClick={() => void launch()}>
                    {starting ? null : <ExternalLink size={15} aria-hidden="true" />}
                    {t("add_account.device.start_button", { provider: providerName })}
                  </Button>
                </div>
                <LoginOptions
                  provider={provider}
                  values={options}
                  onChange={onOptionsChange}
                  proxyEntries={proxyEntries}
                  proxyCheckState={proxyCheckState}
                  disabled={starting}
                />
              </div>
            )}
          </Step>
          <Step
            index={2}
            state={stepTwo}
            title={t("add_account.device.confirm_title", { provider: providerName })}
            description={t(
              login?.userCode
                ? "add_account.device.confirm_desc"
                : "add_account.device.confirm_desc_no_code",
            )}
          >
            {live && login ? (
              <div className="grid gap-3">
                {login.userCode ? <UserCode code={login.userCode} /> : null}
                {popupBlocked ? (
                  <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                    {t("add_account.device.popup_blocked")}
                  </p>
                ) : null}
                <div>
                  <Button
                    variant={popupBlocked ? "primary" : "default"}
                    onClick={() => {
                      openInNewTab(login.url);
                      setPopupBlocked(false);
                    }}
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                    {t("add_account.device.open_page")}
                  </Button>
                </div>
              </div>
            ) : null}
          </Step>
          <Step
            index={3}
            state={stepThree}
            last
            title={t("add_account.device.finish_title")}
            description={
              live ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  {t("add_account.device.finish_waiting")}
                </span>
              ) : (
                t("add_account.device.finish_desc")
              )
            }
          />
        </Steps>
      </ScrollFade>
      <LoginStatusBar
        phase={phase}
        waitingLabel={t("add_account.status.waiting_device")}
        regenerateLabel={t("add_account.status.regenerate_device")}
        onRestart={() => void launch()}
      />
    </>
  );
}
