import { useCallback, useEffect, useRef, useState } from "react";
import { oauthApi, type OAuthProvider, type OAuthProxyOptions } from "@code-proxy/api-client";
import { describeLoginError, describeStatusError, type LoginProblem } from "../model/loginErrors";
import { normalizeStartedLogin, type StartedLogin } from "../model/startedLogin";

/** Status poll cadence while a login is open. */
const POLL_INTERVAL_MS = 2500;

export type OAuthLoginPhase =
  | { name: "idle" }
  | { name: "starting" }
  /** Waiting for the operator: authorize in the browser, paste, or approve the device code. */
  | { name: "waiting"; login: StartedLogin }
  /** The pasted callback is on its way to the server. */
  | { name: "submitting"; login: StartedLogin }
  /** Callback accepted; the server is exchanging the code for tokens. */
  | { name: "finishing"; login: StartedLogin }
  | { name: "succeeded"; login: StartedLogin }
  | {
      name: "failed";
      login?: StartedLogin;
      problem: LoginProblem;
      /** Where it failed: a failed start has no login to keep showing. */
      stage: "start" | "login";
    };

export interface UseOAuthLoginOptions {
  provider?: OAuthProvider;
  /** Called once per successful login. */
  onSucceeded?: (login: StartedLogin) => void;
}

export interface CallbackSubmitResult {
  ok: boolean;
  /** Set when the server refused the callback but the login itself is still open. */
  problem?: LoginProblem;
}

const isOpen = (phase: OAuthLoginPhase) =>
  phase.name === "waiting" || phase.name === "submitting" || phase.name === "finishing";

/**
 * One login at a time for one provider. Every async result is checked against
 * the run it belongs to, so restarting, switching provider or closing the
 * dialog makes late answers from the previous login harmless — an old poll that
 * resolves after a restart must not announce a second success.
 */
export function useOAuthLogin({ provider, onSucceeded }: UseOAuthLoginOptions) {
  const [phase, setPhase] = useState<OAuthLoginPhase>({ name: "idle" });
  const runRef = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const onSucceededRef = useRef(onSucceeded);
  onSucceededRef.current = onSucceeded;
  const proxyIdRef = useRef<string | undefined>(undefined);

  const reset = useCallback(() => {
    runRef.current += 1;
    setPhase({ name: "idle" });
  }, []);

  // A different provider is a different login.
  useEffect(() => reset, [provider, reset]);

  const succeed = useCallback((run: number, login: StartedLogin) => {
    if (runRef.current !== run || phaseRef.current.name === "succeeded") return;
    runRef.current += 1; // stops polling and ignores any answer still in flight
    setPhase({ name: "succeeded", login });
    onSucceededRef.current?.(login);
  }, []);

  const fail = useCallback((run: number, problem: LoginProblem, login?: StartedLogin) => {
    if (runRef.current !== run) return;
    runRef.current += 1;
    setPhase({ name: "failed", login, problem, stage: login ? "login" : "start" });
  }, []);

  const pollOnce = useCallback(
    async (run: number, login: StartedLogin) => {
      if (!login.state) return;
      try {
        const status = await oauthApi.getAuthStatus(login.state);
        if (runRef.current !== run) return;
        if (status.status === "ok") succeed(run, login);
        else if (status.status === "error") fail(run, describeStatusError(status), login);
      } catch (error) {
        if (runRef.current !== run) return;
        const problem = describeLoginError(error);
        // A blip in connectivity should not end a login the operator is still completing.
        if (problem.kind !== "network") fail(run, problem, login);
      }
    },
    [fail, succeed],
  );

  const activeLogin = isOpen(phase) ? phase.login : undefined;
  const activeRun = activeLogin ? runRef.current : -1;

  // Poll while the login is open, and right away when the operator comes back
  // to this tab — usually straight from authorizing in another one.
  useEffect(() => {
    if (!activeLogin) return;
    const run = activeRun;
    const tick = () => void pollOnce(run, activeLogin);
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeLogin, activeRun, pollOnce]);

  // The server stops accepting the callback at expiresAt; say so instead of
  // letting the operator paste into a dead login. A callback it already took
  // keeps finishing past that point, so only a login still waiting expires.
  useEffect(() => {
    if (!activeLogin) return;
    const run = activeRun;
    const timer = window.setTimeout(
      () => {
        if (phaseRef.current.name === "waiting") fail(run, { kind: "expired" }, activeLogin);
      },
      Math.max(0, activeLogin.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [activeLogin, activeRun, fail]);

  const start = useCallback(
    async (options: OAuthProxyOptions = {}) => {
      if (!provider) return null;
      runRef.current += 1;
      const run = runRef.current;
      proxyIdRef.current = options.proxyId?.trim() || undefined;
      setPhase({ name: "starting" });
      try {
        const response = await oauthApi.startAuth(provider, options);
        if (runRef.current !== run) return null;
        const login = normalizeStartedLogin(provider, response);
        if (!login.url) {
          fail(run, { kind: "failed", message: "" });
          return null;
        }
        setPhase({ name: "waiting", login });
        return login;
      } catch (error) {
        fail(run, describeLoginError(error));
        return null;
      }
    },
    [fail, provider],
  );

  const submitCallback = useCallback(
    async (submission: { code: string; state?: string }): Promise<CallbackSubmitResult> => {
      const current = phaseRef.current;
      if (current.name !== "waiting" || !provider) return { ok: false };
      const run = runRef.current;
      const { login } = current;
      setPhase({ name: "submitting", login });
      try {
        await oauthApi.submitCallback(
          provider,
          { code: submission.code, state: submission.state || login.state },
          { proxyId: proxyIdRef.current },
        );
        if (runRef.current !== run) return { ok: false };
        setPhase({ name: "finishing", login });
        void pollOnce(run, login);
        return { ok: true };
      } catch (error) {
        if (runRef.current !== run) return { ok: false };
        const problem = describeLoginError(error);
        if (problem.kind === "expired" || problem.kind === "superseded") {
          fail(run, problem, login);
        } else {
          // The login is still open: let the operator fix what they pasted.
          setPhase({ name: "waiting", login });
        }
        return { ok: false, problem };
      }
    },
    [fail, pollOnce, provider],
  );

  return { phase, start, submitCallback, reset };
}
