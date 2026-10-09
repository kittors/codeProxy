import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client";
import { Button, Step, Steps, type StepState, ScrollFade } from "@code-proxy/ui";
import type { ProxyPoolSelect } from "@features/proxy-pool";
import { useOAuthLogin } from "../hooks/useOAuthLogin";
import type { AccountProvider } from "../model/catalog";
import { copyText } from "../model/clipboard";
import { navigatePendingWindow, openInNewTab, openPendingWindow } from "../model/loginWindow";
import type { StartedLogin } from "../model/startedLogin";
import { BrowserMock, displayCallbackAddress } from "./BrowserMock";
import { CallbackPasteBox } from "./CallbackPasteBox";
import { LoginOptions, type LoginOptionValues } from "./LoginOptions";
import { LoginStatusBar } from "./LoginStatusBar";

/** Copies the authorization link, for signing in from another browser or device. */
function CopyLinkButton({ url }: { url: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Button size="sm" variant="ghost" title={url} onClick={() => void copy()}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {copied ? t("add_account.steps.copied") : t("add_account.steps.copy_link")}
    </Button>
  );
}

/**
 * Browser sign-in for providers whose login redirects back (Codex, Claude,
 * Gemini CLI, Antigravity, Grok, iFlow). Three steps on one screen: open the
 * provider's page, see exactly what the browser will show afterwards, paste it.
 *
 * Claude gets Anthropic's own code page on remote servers, which displays a
 * code with a copy button instead of a page that fails to load. When the
 * server runs on this machine, the redirect reaches it directly and the login
 * completes without pasting anything.
 */
export function OAuthFlowPanel({
  provider,
  providerName,
  options,
  onOptionsChange,
  proxyEntries,
  proxyCheckState,
  serverOnLoopback,
  onSucceeded,
}: {
  provider: AccountProvider;
  providerName: string;
  options: LoginOptionValues;
  onOptionsChange: (next: Partial<LoginOptionValues>) => void;
  proxyEntries: ProxyPoolEntry[];
  proxyCheckState: ComponentProps<typeof ProxyPoolSelect>["checkState"];
  serverOnLoopback: boolean;
  onSucceeded: (login: StartedLogin) => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { phase, start, submitCallback } = useOAuthLogin({ provider: provider.oauth, onSucceeded });
  const pasteRef = useRef<HTMLDivElement | null>(null);
  const [opened, setOpened] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [manualPaste, setManualPaste] = useState(false);

  const login = "login" in phase ? phase.login : undefined;
  const live =
    phase.name === "waiting" || phase.name === "submitting" || phase.name === "finishing";
  const askCodePage = provider.oauth === "anthropic" && !serverOnLoopback;
  const flow: "redirect" | "code" = login
    ? login.flow === "code"
      ? "code"
      : "redirect"
    : askCodePage
      ? "code"
      : "redirect";
  const autoReturn = flow === "redirect" && serverOnLoopback;
  const busy = phase.name === "submitting" || phase.name === "finishing";
  const starting = phase.name === "starting";

  const launch = async () => {
    setPopupBlocked(false);
    setManualPaste(false);
    const pending = openPendingWindow();
    const started = await start({
      proxyId: options.proxyId,
      projectId: provider.projectId ? options.projectId : undefined,
      usingApi: provider.endpointMode ? options.usingApi : undefined,
      callbackMode: askCodePage ? "code" : undefined,
    });
    if (!started) {
      pending?.close();
      setOpened(false);
      return;
    }
    if (!navigatePendingWindow(pending, started.url)) setPopupBlocked(true);
    setOpened(true);
    // The paste box is where the operator acts next; bring it on screen.
    window.requestAnimationFrame(() =>
      pasteRef.current?.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
      }),
    );
  };

  const reopen = () => {
    if (!login) return;
    openInNewTab(login.url);
    setPopupBlocked(false);
    setOpened(true);
  };

  const stepOne: StepState = live && opened ? "done" : "active";
  const stepTwo: StepState = busy ? "done" : live && opened ? "active" : "upcoming";
  const stepThree: StepState = busy ? "active" : live && opened ? "active" : "upcoming";

  return (
    <>
      <ScrollFade className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <Steps>
          <Step
            index={1}
            state={stepOne}
            title={
              live
                ? t("add_account.steps.opened_title", { provider: providerName })
                : t("add_account.steps.open_title", { provider: providerName })
            }
            description={
              live
                ? undefined
                : t(
                    autoReturn
                      ? "add_account.steps.open_desc_local"
                      : "add_account.steps.open_desc",
                  )
            }
          >
            {live && login ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="default" onClick={reopen}>
                    <ExternalLink size={14} aria-hidden="true" />
                    {t("add_account.steps.reopen")}
                  </Button>
                  <CopyLinkButton url={login.url} />
                </div>
                {popupBlocked ? (
                  <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                    {t("add_account.steps.popup_blocked")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-3">
                <div>
                  <Button variant="primary" loading={starting} onClick={() => void launch()}>
                    {starting ? null : <ExternalLink size={15} aria-hidden="true" />}
                    {t("add_account.steps.open_button", { provider: providerName })}
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

          {autoReturn ? (
            <>
              <Step
                index={2}
                state={stepTwo}
                title={t("add_account.steps.authorize_title_local")}
                description={t("add_account.steps.authorize_desc_local")}
              />
              <Step
                index={3}
                state={stepThree}
                last
                title={t("add_account.steps.finish_title_local")}
                description={
                  live ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      {t("add_account.steps.finish_waiting_local")}
                    </span>
                  ) : (
                    t("add_account.steps.finish_desc_local")
                  )
                }
              >
                {live && login ? (
                  <div className="grid gap-2">
                    <button
                      type="button"
                      aria-expanded={manualPaste}
                      onClick={() => setManualPaste((value) => !value)}
                      className="inline-flex w-fit items-center gap-1 text-xs text-ink-3 transition-colors hover:text-ink"
                    >
                      {t("add_account.steps.manual_paste")}
                      <motion.span animate={{ rotate: manualPaste ? 180 : 0 }}>
                        <ChevronDown size={13} aria-hidden="true" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {manualPaste ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          // 高度动画要裁切，但粘贴框的阴影描边画在框外：四周各留 4px 再用负边距拉回。
                          className="-m-1 overflow-hidden p-1"
                        >
                          <CallbackPasteBox
                            flow="redirect"
                            expectedState={login.state}
                            redirectUri={login.redirectUri}
                            busy={busy}
                            onSubmit={submitCallback}
                            watchClipboard={false}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
              </Step>
            </>
          ) : (
            <>
              <Step
                index={2}
                state={stepTwo}
                title={t(
                  flow === "code"
                    ? "add_account.steps.authorize_title_code"
                    : "add_account.steps.authorize_title",
                )}
                description={t(
                  flow === "code"
                    ? "add_account.steps.authorize_desc_code"
                    : "add_account.steps.authorize_desc",
                )}
              >
                <BrowserMock
                  variant={flow}
                  address={
                    flow === "code"
                      ? "platform.claude.com/oauth/code/callback?code=···&state=···"
                      : displayCallbackAddress(login?.redirectUri ?? provider.callbackHint)
                  }
                  animate={stepTwo === "active"}
                />
              </Step>
              <Step
                index={3}
                state={stepThree}
                last
                title={t(
                  flow === "code"
                    ? "add_account.steps.paste_title_code"
                    : "add_account.steps.paste_title",
                )}
                description={t("add_account.steps.paste_desc")}
              >
                {login && live ? (
                  <div ref={pasteRef} className="scroll-mb-4">
                    <CallbackPasteBox
                      flow={flow}
                      expectedState={login.state}
                      redirectUri={flow === "redirect" ? login.redirectUri : undefined}
                      busy={busy}
                      onSubmit={submitCallback}
                      watchClipboard={opened}
                    />
                  </div>
                ) : (
                  // 粘贴框出现之前的占位：无边淡底（虚线框只留给文件拖放区）。
                  <div className="rounded-2xl bg-subtle px-4 py-3 text-xs text-ink-3">
                    {t("add_account.steps.paste_locked")}
                  </div>
                )}
              </Step>
            </>
          )}
        </Steps>
      </ScrollFade>
      <LoginStatusBar
        phase={phase}
        waitingLabel={t(
          autoReturn ? "add_account.status.waiting_local" : "add_account.status.waiting",
        )}
        onRestart={() => void launch()}
      />
    </>
  );
}
