import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";
import type { OAuthLoginPhase } from "../hooks/useOAuthLogin";
import { useLoginProblemText } from "../hooks/useLoginProblemText";

/** Re-render once a second while `active`, for countdowns. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export const formatRemaining = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * One line that always says where the login stands and how long the link
 * lives, so a stale link is replaced before anyone pastes into it.
 */
export function LoginStatusBar({
  phase,
  waitingLabel,
  regenerateLabel,
  onRestart,
}: {
  phase: OAuthLoginPhase;
  /** What "waiting" means for this flow: authorize in the browser, or approve the device code. */
  waitingLabel: string;
  /** The "start a fresh login" action while waiting; defaults to a new link. */
  regenerateLabel?: string;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const describeProblem = useLoginProblemText();
  const waiting = phase.name === "waiting";
  const now = useNow(waiting);

  if (phase.name === "idle" || phase.name === "starting" || phase.name === "succeeded") return null;

  let dot = "bg-amber-500";
  let pulse = true;
  let text: string;
  let remaining: string | null = null;
  let remainingTone = "text-ink-3";

  if (phase.name === "waiting") {
    text = waitingLabel;
    const left = phase.login.expiresAt - now;
    remaining = t("add_account.status.expires_in", { time: formatRemaining(left) });
    if (left <= 30_000) remainingTone = "text-rose-600 dark:text-rose-300";
    else if (left <= 120_000) remainingTone = "text-amber-700 dark:text-amber-300";
  } else if (phase.name === "submitting" || phase.name === "finishing") {
    text = t("add_account.status.finishing");
    dot = "";
  } else {
    text = describeProblem(phase.problem, phase.stage);
    dot = "bg-rose-500";
    pulse = false;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      // 面板底部的一行状态：不画分隔线、不垫底色，和上面的步骤靠留白分开。
      className="flex min-h-12 items-center gap-3 px-5 py-2.5 sm:px-6"
    >
      <span className="relative grid h-4 w-4 shrink-0 place-items-center" aria-hidden="true">
        {dot ? (
          <>
            {pulse ? (
              <motion.span
                className={`absolute h-2.5 w-2.5 rounded-full ${dot}`}
                animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            ) : null}
            <span className={`relative h-2 w-2 rounded-full ${dot}`} />
          </>
        ) : (
          <Loader2 size={14} className="animate-spin text-ink-2" />
        )}
      </span>
      <AnimatePresence initial={false} mode="wait">
        <motion.p
          key={text}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.15 }}
          className={[
            "min-w-0 flex-1 text-sm",
            phase.name === "failed" ? "text-rose-700 dark:text-rose-300" : "text-ink-2",
          ].join(" ")}
        >
          {text}
          {remaining ? (
            <span className={`ml-2 tabular-nums ${remainingTone}`}>· {remaining}</span>
          ) : null}
        </motion.p>
      </AnimatePresence>
      {phase.name === "waiting" || phase.name === "failed" ? (
        <Button
          size="xs"
          variant={phase.name === "failed" ? "primary" : "ghost"}
          onClick={onRestart}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {phase.name === "failed"
            ? t("add_account.status.restart")
            : (regenerateLabel ?? t("add_account.status.regenerate"))}
        </Button>
      ) : null}
    </div>
  );
}
