import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const PROVIDERS: { id: OAuthProvider; title: string; hint: string }[] = [
  { id: "codex", title: "Codex OAuth", hint: "一键启动授权流程，服务端会自动保存认证文件。" },
  {
    id: "anthropic",
    title: "Anthropic OAuth",
    hint: "用于 Claude / Anthropic 服务的 OAuth Login。",
  },
  {
    id: "antigravity",
    title: "Antigravity OAuth",
    hint: "用于 Antigravity 配额/能力相关的 OAuth Login。",
  },
  {
    id: "gemini-cli",
    title: "Gemini CLI OAuth",
    hint: "支持可选 Project ID；不填则由服务端自动选择。",
  },
  { id: "kimi", title: "Kimi OAuth", hint: "如果服务端支持，将自动保存认证文件。" },
  { id: "qwen", title: "Qwen OAuth", hint: "如果服务端支持，将自动保存认证文件。" },
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
            notify({ type: "success", message: `${provider} 授权成功` });
            window.clearInterval(timer);
            delete timers.current[provider];
          } else if (res.status === "error") {
            updateProviderState(provider, { status: "error", error: res.error, polling: false });
            notify({ type: "error", message: `${provider} 授权失败：${res.error || ""}`.trim() });
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
    [notify, updateProviderState],
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
        const message = getErrorMessage(err) || "启动授权失败";
        updateProviderState(provider, { status: "error", error: message, polling: false });
        notify({ type: "error", message: `${provider} 启动授权失败：${message}` });
      }
    },
    [notify, startPolling, states, updateProviderState],
  );

  const copyLink = useCallback(
    async (url?: string) => {
      const link = String(url ?? "").trim();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        notify({ type: "success", message: "链接已复制" });
      } catch {
        notify({ type: "error", message: "复制失败（浏览器不支持或无权限）" });
      }
    },
    [notify],
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
        notify({ type: "info", message: "请输入回调 URL" });
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
        notify({ type: "success", message: "回调提交成功" });
      } catch (err: unknown) {
        const message = getErrorMessage(err) || "回调提交失败";
        updateProviderState(provider, {
          callbackSubmitting: false,
          callbackStatus: "error",
          callbackError: message,
        });
        notify({ type: "error", message });
      }
    },
    [notify, states, updateProviderState],
  );

  const iflowHint = useMemo(() => {
    if (!iflowResult) return "使用 iFlow Cookie 进行一次性认证导入。";
    if (iflowResult.status === "ok") return `导入成功：${iflowResult.saved_path || ""}`.trim();
    return `导入失败：${iflowResult.error || ""}`.trim();
  }, [iflowResult]);

  const submitIflow = useCallback(async () => {
    const cookie = iflowCookie.trim();
    if (!cookie) {
      notify({ type: "info", message: "请输入 Cookie" });
      return;
    }
    setIflowLoading(true);
    setIflowResult(null);
    try {
      const res = await oauthApi.iflowCookieAuth(cookie);
      setIflowResult(res);
      notify({
        type: res.status === "ok" ? "success" : "error",
        message: res.status === "ok" ? "导入成功" : res.error || "导入失败",
      });
    } catch (err: unknown) {
      notify({ type: "error", message: getErrorMessage(err) || "导入失败" });
    } finally {
      setIflowLoading(false);
    }
  }, [iflowCookie, notify]);

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
        notify({ type: "success", message: "Vertex 导入成功" });
      } catch (err: unknown) {
        notify({ type: "error", message: getErrorMessage(err) || "Vertex 导入失败" });
      } finally {
        setVertexLoading(false);
      }
    },
    [notify, vertexLocation],
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
              title={provider.title}
              description={provider.hint}
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
                  开始授权
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
                    placeholder="Project ID（可选）"
                  />
                </div>
              ) : null}

              <div className="grid min-w-0 gap-3">
                <div className="grid min-w-0 gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                      授权链接
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void copyLink(url)}
                        disabled={!url}
                      >
                        <Copy size={14} />
                        复制
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLink(url)}
                        disabled={!url}
                      >
                        <ExternalLink size={14} />
                        打开
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden break-all rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                    {url ? url : "--"}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-white/65">
                    状态：
                    {polling
                      ? "轮询中…"
                      : status === "success"
                        ? "成功"
                        : status === "error"
                          ? "失败"
                          : "待开始"}
                    {state.error ? ` · ${state.error}` : ""}
                  </div>
                </div>

                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                    远程回调提交
                  </p>
                  <TextInput
                    value={state.callbackUrl ?? ""}
                    onChange={(e) =>
                      updateProviderState(provider.id, { callbackUrl: e.currentTarget.value })
                    }
                    placeholder="粘贴浏览器回调后的完整 URL"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void submitCallback(provider.id)}
                      disabled={Boolean(state.callbackSubmitting)}
                    >
                      <Send size={14} />
                      {state.callbackSubmitting ? "提交中…" : "提交回调"}
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
                          ? "已提交"
                          : state.callbackError || "提交失败"}
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
          title="iFlow Cookie 认证"
          description={iflowHint}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void submitIflow()}
              disabled={iflowLoading}
            >
              <ShieldCheck size={14} />
              {iflowLoading ? "导入中…" : "导入"}
            </Button>
          }
          loading={false}
        >
          <textarea
            value={iflowCookie}
            onChange={(e) => setIflowCookie(e.currentTarget.value)}
            placeholder="粘贴 Cookie（将发送到管理 API）"
            className="min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
            spellCheck={false}
            aria-label="iFlow Cookie"
          />
        </Card>

        <Card
          title="Vertex 凭证导入"
          description="上传 Vertex 凭证文件并由服务端生成认证文件。"
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
                  {vertexLoading ? "导入中…" : "选择文件"}
                </Button>
              </span>
            </label>
          }
        >
          <div className="grid gap-3">
            <TextInput
              value={vertexLocation}
              onChange={(e) => setVertexLocation(e.currentTarget.value)}
              placeholder="location（可选）"
              endAdornment={<KeyRound size={16} className="text-slate-400" />}
            />
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
                最近导入
              </p>
              <p className="mt-2 font-mono text-xs text-slate-900 dark:text-white">
                文件：{vertexFileName || "--"}
              </p>
              {vertexResult ? (
                <div className="mt-2 space-y-1 font-mono text-xs text-slate-700 dark:text-slate-200">
                  <div>project_id：{vertexResult.projectId || "--"}</div>
                  <div>email：{vertexResult.email || "--"}</div>
                  <div>location：{vertexResult.location || "--"}</div>
                  <div>auth_file：{vertexResult.authFile || "--"}</div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-600 dark:text-white/65">尚未导入</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
