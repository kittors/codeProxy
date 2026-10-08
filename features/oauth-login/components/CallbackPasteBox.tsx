import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Check, Circle, ClipboardPaste, CornerDownLeft, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";
import { useClipboardOnReturn } from "../hooks/useClipboardOnReturn";
import type { CallbackSubmitResult } from "../hooks/useOAuthLogin";
import { checkCallbackInput, type CallbackCheck } from "../model/callbackInput";
import { canReadClipboard } from "../model/clipboard";
import type { LoginProblem } from "../model/loginErrors";
import { useLoginProblemText } from "../hooks/useLoginProblemText";

type Chip = { key: string; tone: "ok" | "pending" | "bad" | "warn"; label: string };

function CheckChip({ tone, label }: Omit<Chip, "key">) {
  const reduceMotion = useReducedMotion();
  const icon =
    tone === "ok" ? (
      <Check size={12} strokeWidth={3} />
    ) : tone === "bad" ? (
      <X size={12} strokeWidth={3} />
    ) : tone === "warn" ? (
      <AlertTriangle size={12} />
    ) : (
      <Circle size={10} />
    );
  return (
    <motion.span
      layout={!reduceMotion}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "ok"
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : tone === "bad"
            ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
            : tone === "warn"
              ? "bg-amber-500/14 text-amber-800 dark:text-amber-300"
              : "bg-hover text-ink-3",
      ].join(" ")}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </motion.span>
  );
}

/**
 * Where the operator pastes what the browser ended up showing. It accepts the
 * whole address, its query string, `code#state` or a bare code, checks it as it
 * arrives, and submits a paste that is clearly right without waiting for a
 * click. Typed input waits for Enter, since a half-typed code also "looks" valid.
 */
export function CallbackPasteBox({
  flow,
  expectedState,
  redirectUri,
  busy,
  onSubmit,
  watchClipboard,
}: {
  flow: "redirect" | "code";
  expectedState: string;
  redirectUri?: string;
  /** A submit or the token exchange is in progress. */
  busy: boolean;
  onSubmit: (submission: { code: string; state?: string }) => Promise<CallbackSubmitResult>;
  /** Pick a matching callback off the clipboard when the operator returns to the tab. */
  watchClipboard: boolean;
}) {
  const { t } = useTranslation();
  const describeProblem = useLoginProblemText();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageRef = useRef<HTMLDivElement | null>(null);
  const [value, setValue] = useState("");
  const [serverProblem, setServerProblem] = useState<LoginProblem | null>(null);
  const [note, setNote] = useState<"clipboard_denied" | "picked_up" | null>(null);

  const check: CallbackCheck = useMemo(
    () => checkCallbackInput(value, { state: expectedState, redirectUri }),
    [expectedState, redirectUri, value],
  );

  const submit = useCallback(
    async (candidate: CallbackCheck) => {
      if (!candidate.submission || busy) return;
      setServerProblem(null);
      const result = await onSubmit(candidate.submission);
      if (!result.ok && result.problem) setServerProblem(result.problem);
    },
    [busy, onSubmit],
  );

  /** Pasted or picked-up text: show it, and send it straight away when it is unambiguous. */
  const accept = useCallback(
    (text: string, source: "paste" | "clipboard" | "return") => {
      const candidate = checkCallbackInput(text, { state: expectedState, redirectUri });
      // A callback picked off the clipboard on return must prove it belongs to
      // this login; anything else on the clipboard is left alone.
      if (source === "return" && candidate.stateMatches !== true) return;
      setValue(text.trim());
      setServerProblem(null);
      setNote(source === "return" ? "picked_up" : null);
      if (candidate.submission && candidate.stateMatches !== false) void submit(candidate);
    },
    [expectedState, redirectUri, submit],
  );

  const { returned } = useClipboardOnReturn(watchClipboard && !busy && !value, (text) =>
    accept(text, "return"),
  );

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) accept(text, "clipboard");
    } catch {
      setNote("clipboard_denied");
      inputRef.current?.focus();
    }
  };

  const chips: Chip[] = [];
  if (value.trim()) {
    chips.push({
      key: "code",
      tone: check.hasCode ? "ok" : "bad",
      label: t("add_account.paste.check_code"),
    });
    if (check.stateMatches !== null) {
      chips.push({
        key: "state",
        tone: check.stateMatches ? "ok" : "bad",
        label: t(
          check.stateMatches
            ? "add_account.paste.check_state"
            : "add_account.paste.check_state_other",
        ),
      });
    }
    if (check.parsed?.source === "url" && redirectUri && check.hasCode) {
      chips.push({
        key: "location",
        tone: check.unexpectedLocation ? "warn" : "ok",
        label: t(
          check.unexpectedLocation
            ? "add_account.paste.check_location_other"
            : "add_account.paste.check_location",
        ),
      });
    }
  }

  let message: { tone: "bad" | "warn" | "info"; text: ReactNode } | null = null;
  if (serverProblem) {
    message = { tone: "bad", text: describeProblem(serverProblem) };
  } else if (value.trim() && check.issue && check.issue !== "empty") {
    const providerError = check.parsed?.error ?? "";
    message = {
      tone: "bad",
      text:
        check.issue === "provider_error"
          ? providerError === "access_denied"
            ? t("add_account.paste.issue_denied")
            : t("add_account.paste.issue_provider_error", {
                error: check.parsed?.errorDescription || providerError,
              })
          : t(`add_account.paste.issue_${check.issue}`),
    };
  } else if (note === "clipboard_denied") {
    message = { tone: "info", text: t("add_account.paste.clipboard_denied") };
  } else if (note === "picked_up") {
    message = { tone: "info", text: t("add_account.paste.picked_up") };
  }

  // A message under the box can land below the fold of the scrolling panel.
  const messageKey = message
    ? typeof message.text === "string"
      ? message.text
      : message.tone
    : "";
  useEffect(() => {
    if (messageKey) messageRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messageKey]);

  const ready = Boolean(check.submission) && !busy;
  const nudge = returned && !value && !busy;
  // Without the async Clipboard API (plain-HTTP panels) the button could only fail.
  const clipboardReadable = canReadClipboard();

  return (
    <div className="grid gap-2">
      <div
        // 和输入框同一套阴影描边（不画 border）：出错是红色描边，可以提交是绿色描边。
        className={[
          "group relative rounded-2xl bg-field transition-shadow duration-200",
          message?.tone === "bad"
            ? "shadow-[0_0_0_1px_rgb(229_72_77/0.8)]"
            : ready
              ? "shadow-[0_0_0_1px_rgb(16_163_127/0.7)]"
              : "shadow-control hover:shadow-control-hover focus-within:shadow-control-focus",
        ].join(" ")}
      >
        <textarea
          ref={inputRef}
          value={value}
          rows={2}
          spellCheck={false}
          autoComplete="off"
          aria-label={t(
            flow === "code" ? "add_account.paste.label_code" : "add_account.paste.label_redirect",
          )}
          placeholder={t(
            flow === "code"
              ? "add_account.paste.placeholder_code"
              : "add_account.paste.placeholder_redirect",
            {
              example: redirectUri
                ? `${redirectUri}?code=…&state=…`
                : "http://localhost:1455/auth/callback?code=…",
            },
          )}
          disabled={busy}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setServerProblem(null);
            setNote(null);
          }}
          onPaste={(event) => {
            const text =
              event.clipboardData.getData("text/plain") || event.clipboardData.getData("text");
            if (!text) return;
            event.preventDefault();
            accept(text, "paste");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(check);
            }
          }}
          className="block w-full resize-none bg-transparent px-4 pt-3 pb-12 font-mono text-xs leading-5 break-all text-ink outline-none placeholder:font-sans placeholder:text-sm placeholder:text-ink-3 disabled:opacity-60"
        />
        <div className="absolute right-2 bottom-2 left-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-live="polite">
            <AnimatePresence initial={false}>
              {chips.map(({ key, ...chip }) => (
                <CheckChip key={key} {...chip} />
              ))}
            </AnimatePresence>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {value.trim() ? (
              <Button
                size="xs"
                variant={ready ? "primary" : "default"}
                disabled={!ready}
                loading={busy}
                onClick={() => void submit(check)}
              >
                <CornerDownLeft size={13} aria-hidden="true" />
                {t("add_account.paste.submit")}
              </Button>
            ) : clipboardReadable ? (
              <span className="relative inline-flex">
                {nudge ? (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full shadow-control-focus"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                ) : null}
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy}
                  onClick={() => void pasteFromClipboard()}
                >
                  <ClipboardPaste size={13} aria-hidden="true" />
                  {t("add_account.paste.paste_button")}
                </Button>
              </span>
            ) : (
              <kbd className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-sans text-2xs text-ink-3 dark:bg-white/[0.07]">
                {t("add_account.paste.shortcut")}
              </kbd>
            )}
          </div>
        </div>
      </div>
      <div ref={messageRef} className="scroll-mb-4">
        <AnimatePresence initial={false} mode="wait">
          {message ? (
            <motion.p
              key={typeof message.text === "string" ? message.text : message.tone}
              role={message.tone === "bad" ? "alert" : "status"}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className={[
                "text-xs",
                message.tone === "bad"
                  ? "text-rose-600 dark:text-rose-300"
                  : message.tone === "warn"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-ink-2",
              ].join(" ")}
            >
              {message.text}
            </motion.p>
          ) : nudge ? (
            <motion.p
              key="nudge"
              role="status"
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-accent-ink colorful:text-sky-700 colorful:dark:text-sky-300"
            >
              {t("add_account.paste.nudge")}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
