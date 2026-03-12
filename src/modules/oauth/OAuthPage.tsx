import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { oauthApi, vertexApi } from "@/lib/http/apis";
import type { IFlowCookieAuthResponse, OAuthProvider } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { useToast } from "@/modules/ui/ToastProvider";

type ProviderStatus = "idle" | "waiting" | "success" | "error";

type ProviderState = {
  url?: string;
  state?: string;
  status?: ProviderStatus;
  error?: string;
  polling?: boolean;
  projectId?: string;
  callbackUrl?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: "success" | "error";
  callbackError?: string;
};

const PROVIDERS: { id: OAuthProvider; titleKey: string; hintKey: string }[] = [
  { id: "codex", titleKey: "oauth.providers.codex.title", hintKey: "oauth.providers.codex.hint" },
  {
    id: "anthropic",
    titleKey: "oauth.providers.anthropic.title",
    hintKey: "oauth.providers.anthropic.hint",
  },
  {
    id: "antigravity",
    titleKey: "oauth.providers.antigravity.title",
    hintKey: "oauth.providers.antigravity.hint",
  },
  {
    id: "gemini-cli",
    titleKey: "oauth.providers.gemini_cli.title",
    hintKey: "oauth.providers.gemini_cli.hint",
  },
  { id: "kimi", titleKey: "oauth.providers.kimi.title", hintKey: "oauth.providers.kimi.hint" },
  { id: "qwen", titleKey: "oauth.providers.qwen.title", hintKey: "oauth.providers.qwen.hint" },
];

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as any).message === "string"
  ) {
    return String((err as any).message);
  }
  return "";
};

export function OAuthPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const timers = useRef<Record<string, number>>({});

  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>(
    {} as Record<OAuthProvider, ProviderState>,
  );
  const [iflowCookie, setIflowCookie] = useState("");
  const [iflowLoading, setIflowLoading] = useState(false);
  const [iflowResult, setIflowResult] = useState<IFlowCookieAuthResponse | null>(null);

  const [vertexFileName, setVertexFileName] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");
  const [vertexLoading, setVertexLoading] = useState(false);
  const [vertexResult, setVertexResult] = useState<{
    projectId?: string;
    email?: string;
    location?: string;
    authFile?: string;
  } | null>(null);

  const clearTimers = useCallback(() => {
    Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
    timers.current = {};
  }, []);

  const getProviderTitle = useCallback(
    (provider: OAuthProvider) =>
      t(PROVIDERS.find((item) => item.id === provider)?.titleKey ?? "oauth.provider_fallback"),
    [t],
  );

  const getStatusLabel = useCallback(
    (status: ProviderStatus, polling: boolean) => {
      if (polling) return t("oauth.status_polling");
      if (status === "success") return t("oauth.status_success");
      if (status === "error") return t("oauth.status_failed");
      return t("oauth.status_waiting");
    },
    [t],
  );

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const updateProviderState = useCallback(
    (provider: OAuthProvider, next: Partial<ProviderState>) => {
      setStates((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], ...next },
      }));
    },
    [],
  );

  const startPolling = useCallback(
    (provider: OAuthProvider, state: string) => {
      if (timers.current[provider]) {
        window.clearInterval(timers.current[provider]);
      }
      const timer = window.setInterval(async () => {
        try {
          const res = await oauthApi.getAuthStatus(state);
          if (res.status === "ok") {
            updateProviderState(provider, { status: "success", polling: false });
            notify({
              type: "success",
              message: t("oauth.authorization_success", { provider: getProviderTitle(provider) }),
            });
            window.clearInterval(timer);
            delete timers.current[provider];
          } else if (res.status === "error") {
            updateProviderState(provider, { status: "error", error: res.error, polling: false });
            notify({
              type: "error",
              message: t("oauth.authorization_failed", {
                provider: getProviderTitle(provider),
                error: res.error || "",
              }).trim(),
            });
            window.clearInterval(timer);
            delete timers.current[provider];
          }
        } catch (err: unknown) {
          updateProviderState(provider, {
            status: "error",
            error: getErrorMessage(err),
            polling: false,
          });
          window.clearInterval(timer);
          delete timers.current[provider];
        }
      }, 3000);
      timers.current[provider] = timer;
    },
    [getProviderTitle, notify, t, updateProviderState],
  );

  const startAuth = useCallback(
    async (provider: OAuthProvider) => {
      const projectId =
        provider === "gemini-cli" ? (states[provider]?.projectId || "").trim() : undefined;
      updateProviderState(provider, {
        status: "waiting",
        polling: true,
        error: undefined,
        url: "",
        state: "",
        callbackStatus: undefined,
        callbackError: undefined,
      });
      try {
        const res = await oauthApi.startAuth(
          provider,
          provider === "gemini-cli" ? { projectId: projectId || undefined } : undefined,
        );
        updateProviderState(provider, {
          url: res.url,
          state: res.state,
          status: "waiting",
          polling: true,
        });
        if (res.state) {
          startPolling(provider, res.state);
        }
      } catch (err: unknown) {
        const message = getErrorMessage(err) || t("oauth.start_auth_failed_short");
        updateProviderState(provider, { status: "error", error: message, polling: false });
        notify({
          type: "error",
          message: t("oauth.start_auth_failed", {
            provider: getProviderTitle(provider),
            error: message,
          }),
        });
      }
    },
    [getProviderTitle, notify, startPolling, states, t, updateProviderState],
  );

  const copyLink = useCallback(
    async (url?: string) => {
      const link = String(url ?? "").trim();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        notify({ type: "success", message: t("oauth.link_copied") });
      } catch {
        notify({ type: "error", message: t("oauth.copy_failed") });
      }
    },
    [notify, t],
  );

  const openLink = useCallback((url?: string) => {
    const link = String(url ?? "").trim();
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
  }, []);

  const submitCallback = useCallback(
    async (provider: OAuthProvider) => {
      const redirectUrl = (states[provider]?.callbackUrl || "").trim();
      if (!redirectUrl) {
        notify({ type: "info", message: t("oauth.enter_callback_url") });
        return;
      }
      updateProviderState(provider, {
        callbackSubmitting: true,
        callbackStatus: undefined,
        callbackError: undefined,
      });
      try {
        await oauthApi.submitCallback(provider, redirectUrl);
        updateProviderState(provider, { callbackSubmitting: false, callbackStatus: "success" });
        notify({ type: "success", message: t("oauth.callback_submit_success") });
      } catch (err: unknown) {
        const message = getErrorMessage(err) || t("oauth.callback_submit_failed");
        updateProviderState(provider, {
          callbackSubmitting: false,
          callbackStatus: "error",
          callbackError: message,
        });
        notify({ type: "error", message });
      }
    },
    [notify, states, t, updateProviderState],
  );

  const iflowHint = useMemo(() => {
    if (!iflowResult) return t("oauth.iflow_hint_default");
    if (iflowResult.status === "ok") {
      return t("oauth.iflow_hint_success", { path: iflowResult.saved_path || "" }).trim();
    }
    return t("oauth.iflow_hint_failed", { error: iflowResult.error || "" }).trim();
  }, [iflowResult, t]);

  const submitIflow = useCallback(async () => {
    const cookie = iflowCookie.trim();
    if (!cookie) {
      notify({ type: "info", message: t("oauth.enter_cookie") });
      return;
    }
    setIflowLoading(true);
    setIflowResult(null);
    try {
      const res = await oauthApi.iflowCookieAuth(cookie);
      setIflowResult(res);
      notify({
        type: res.status === "ok" ? "success" : "error",
        message: res.status === "ok" ? t("oauth.import_success") : res.error || t("oauth.import_failed"),
      });
    } catch (err: unknown) {
      notify({ type: "error", message: getErrorMessage(err) || t("oauth.import_failed") });
    } finally {
      setIflowLoading(false);
    }
  }, [iflowCookie, notify, t]);

  const onVertexFileChange = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setVertexLoading(true);
      setVertexResult(null);
      setVertexFileName(file.name);
      try {
        const res = await vertexApi.importCredential(file, vertexLocation.trim() || undefined);
        const authFile = (res as any)["auth-file"] ?? (res as any).auth_file;
        setVertexResult({
          projectId: (res as any).project_id,
          email: (res as any).email,
          location: (res as any).location,
          authFile: typeof authFile === "string" ? authFile : undefined,
        });
        notify({ type: "success", message: t("oauth.vertex_import_success") });
      } catch (err: unknown) {
        notify({ type: "error", message: getErrorMessage(err) || t("oauth.vertex_import_failed") });
      } finally {
        setVertexLoading(false);
      }
    },
    [notify, t, vertexLocation],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] ?? {};
          const status = state.status ?? "idle";
          const disabled = status === "waiting";
          const url = state.url ?? "";
          const polling = Boolean(state.polling);

          return (
            <Card
              key={provider.id}
              title={t(provider.titleKey)}
              description={t(provider.hintKey)}
              actions={
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void startAuth(provider.id)}
                  disabled={disabled}
                >
                  {disabled ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {t("oauth.start_authorization")}
                </Button>
              }
            >
              {provider.id === "gemini-cli" ? (
                <div className="mb-3">
                  <TextInput
                    value={state.projectId ?? ""}
                    onChange={(e) =>
                      updateProviderState(provider.id, { projectId: e.currentTarget.value })
                    }
                    placeholder={t("oauth.project_placeholder")}
                  />
                </div>
              ) : null}

              <div className="grid min-w-0 gap-3">
                <div className="grid min-w-0 gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                      {t("oauth.auth_link")}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyLink(url)}
                        disabled={!url}
                      >
                        <Copy size={14} />
                        {t("oauth.copy_link")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLink(url)}
                        disabled={!url}
                      >
                        <ExternalLink size={14} />
                        {t("oauth.open_link")}
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden break-all rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                    {url ? url : "--"}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-white/65">
                    {t("oauth.status_label")}
                    {getStatusLabel(status, polling)}
                    {state.error ? ` · ${state.error}` : ""}
                  </div>
                </div>

                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                    {t("oauth.remote_callback")}
                  </p>
                  <TextInput
                    value={state.callbackUrl ?? ""}
                    onChange={(e) =>
                      updateProviderState(provider.id, { callbackUrl: e.currentTarget.value })
                    }
                    placeholder={t("oauth.callback_placeholder")}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void submitCallback(provider.id)}
                      disabled={Boolean(state.callbackSubmitting)}
                    >
                      <Send size={14} />
                      {state.callbackSubmitting ? t("oauth.callback_submitting") : t("oauth.submit_callback")}
                    </Button>
                    {state.callbackStatus ? (
                      <span
                        className={
                          state.callbackStatus === "success"
                            ? "text-xs font-semibold text-emerald-700 dark:text-emerald-200"
                            : "text-xs font-semibold text-rose-700 dark:text-rose-200"
                        }
                      >
                        {state.callbackStatus === "success"
                          ? t("oauth.callback_submitted")
                          : state.callbackError || t("oauth.callback_submit_failed")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title={t("oauth.iflow_title")}
          description={iflowHint}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void submitIflow()}
              disabled={iflowLoading}
            >
              <ShieldCheck size={14} />
              {iflowLoading ? t("oauth.importing") : t("oauth.import")}
            </Button>
          }
          loading={false}
        >
          <textarea
            value={iflowCookie}
            onChange={(e) => setIflowCookie(e.currentTarget.value)}
            placeholder={t("oauth.cookie_placeholder")}
            className="min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
            spellCheck={false}
            aria-label={t("oauth.iflow_cookie")}
          />
        </Card>

        <Card
          title={t("oauth.vertex_title")}
          description={t("oauth.vertex_desc")}
          actions={
            <label className="inline-flex">
              <input
                type="file"
                className="hidden"
                onChange={(e) => void onVertexFileChange(e.currentTarget.files?.[0] ?? null)}
              />
              <span className="inline-flex">
                <Button variant="secondary" size="sm" disabled={vertexLoading}>
                  <Upload size={14} />
                  {vertexLoading ? t("oauth.importing") : t("oauth.select_file")}
                </Button>
              </span>
            </label>
          }
        >
          <div className="grid gap-3">
            <TextInput
              value={vertexLocation}
              onChange={(e) => setVertexLocation(e.currentTarget.value)}
              placeholder={t("oauth.location_placeholder")}
              endAdornment={<KeyRound size={16} className="text-slate-400" />}
            />
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                {t("oauth.recent_import")}
              </p>
              <p className="mt-2 font-mono text-xs text-slate-900 dark:text-white">
                {t("oauth.file_label")}: {vertexFileName || "--"}
              </p>
              {vertexResult ? (
                <div className="mt-2 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-200">
                  <div>{t("oauth.project_id_label")}: {vertexResult.projectId || "--"}</div>
                  <div>{t("oauth.email_label")}: {vertexResult.email || "--"}</div>
                  <div>{t("oauth.location_label")}: {vertexResult.location || "--"}</div>
                  <div>{t("oauth.auth_file_label")}: {vertexResult.authFile || "--"}</div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-white/65">{t("oauth.not_imported")}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
