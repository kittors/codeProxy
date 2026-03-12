import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock } from "lucide-react";
import { detectApiBaseFromLocation, normalizeApiBase } from "@/lib/connection";
import { useAuth } from "@/modules/auth/AuthProvider";
import { TextInput } from "@/modules/ui/Input";
import { PageBackground } from "@/modules/ui/PageBackground";
import { Reveal } from "@/modules/ui/Reveal";
import { ThemeToggleButton } from "@/modules/ui/ThemeProvider";
import { useToast } from "@/modules/ui/ToastProvider";
import { OpenAILogo, GeminiLogo, ClaudeLogo, VertexLogo } from "@/modules/dashboard/ProviderLogos";

interface RedirectState {
  from?: {
    pathname?: string;
  };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state: {
      isAuthenticated,
      isRestoring,
      apiBase: persistedBase,
      managementKey: persistedKey,
      rememberPassword: persistedRemember,
    },
    actions: { login },
  } = useAuth();
  const { notify } = useToast();

  const defaultBase = useMemo(() => persistedBase || detectApiBaseFromLocation(), [persistedBase]);

  const [apiBase, setApiBase] = useState(defaultBase);
  const [managementKey, setManagementKey] = useState(persistedKey);
  const [rememberPassword, setRememberPassword] = useState(persistedRemember);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);

  const managementEndpoint = useMemo(() => {
    const normalized = normalizeApiBase(apiBase);
    return normalized ? `${normalized}/v0/management` : "-";
  }, [apiBase]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!managementKey.trim()) {
        notify({ type: "error", message: "Enter management key" });
        return;
      }

      setLoading(true);
      try {
        await login({
          apiBase,
          managementKey,
          rememberPassword,
        });
        notify({ type: "success", message: "Login successful" });
        const redirect = (location.state as RedirectState | null)?.from?.pathname ?? "/monitor";
        navigate(redirect, { replace: true, viewTransition: true });
      } catch (submitError) {
        const message =
          submitError instanceof Error ? submitError.message : "Login failed, check address and key";
        notify({ type: "error", message });
      } finally {
        setLoading(false);
      }
    },
    [apiBase, login, location.state, managementKey, navigate, notify, rememberPassword],
  );

  if (isRestoring) {
    return null;
  }

  if (isAuthenticated) {
    const redirect = (location.state as RedirectState | null)?.from?.pathname ?? "/monitor";
    return <Navigate to={redirect} replace />;
  }

  return (
    <PageBackground variant="login">
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggleButton className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200 dark:hover:bg-neutral-950/80" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-12">
        <Reveal className="w-full">
          <div className="grid w-full items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <aside className="space-y-10">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/70 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/60 dark:ring-neutral-800">
                  <Lock size={18} className="text-slate-900 dark:text-white" />
                </div>
                <div className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  Code Proxy
                </div>
              </div>

              <div className="space-y-6">
                <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl dark:text-white">
                  Agent-oriented
                  <br />
                  Unified Proxy Platform
                </h1>
                <p className="max-w-xl text-sm leading-7 text-slate-600 dark:text-white/70">
                  Sign in to the management console to view gateway status and call monitoring data.
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-xs font-semibold tracking-[0.26em] text-slate-500 dark:text-white/50">
                  TRUSTED BY
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-700 dark:text-white/80">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/50 dark:ring-white/10">
                    <OpenAILogo size={16} />
                    OpenAI
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/50 dark:ring-white/10">
                    <GeminiLogo size={16} className="text-blue-500" />
                    Gemini
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/50 dark:ring-white/10">
                    <ClaudeLogo size={16} className="text-[#D97757]" />
                    Claude
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 ring-1 ring-slate-200 backdrop-blur dark:bg-neutral-950/50 dark:ring-white/10">
                    <VertexLogo size={16} className="text-[#4285F4]" />
                    Vertex
                  </span>
                </div>
              </div>
            </aside>

            <section className="relative">
              <div className="rounded-[34px] border border-slate-200 bg-white/90 p-8 text-slate-900 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.6)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-slate-50 dark:shadow-[0_30px_80px_-60px_rgba(0,0,0,0.8)]">
                <div className="space-y-6">
                  <h2 className="text-center text-3xl font-semibold tracking-tight">Sign In</h2>

                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                    <div className="text-xs text-slate-500 dark:text-white/50">
                      Continue with management key
                    </div>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <label className="block space-y-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                        API Address
                      </span>
                      <TextInput
                        value={apiBase}
                        onChange={(event) => setApiBase(event.target.value)}
                        placeholder="e.g. http://localhost:8317"
                        autoComplete="url"
                        className="rounded-full px-5 py-3"
                      />
                      <p className="text-[11px] leading-5 text-slate-500 dark:text-white/50">
                        Endpoint: {managementEndpoint}
                      </p>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                        Management Key
                      </span>
                      <TextInput
                        value={managementKey}
                        onChange={(event) => setManagementKey(event.target.value)}
                        type={showKey ? "text" : "password"}
                        placeholder="Enter MANAGEMENT_KEY"
                        autoComplete="current-password"
                        className="rounded-full px-5 py-3"
                        endAdornment={
                          <button
                            type="button"
                            onClick={() => setShowKey((value) => !value)}
                            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white"
                            aria-label={showKey ? "隐藏Management Key" : "显示Management Key"}
                          >
                            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        }
                      />
                    </label>

                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-white/70">
                      <input
                        type="checkbox"
                        checked={rememberPassword}
                        onChange={(event) => setRememberPassword(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-white/20 dark:bg-neutral-900"
                      />
                      Remember this login
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white/10 dark:hover:bg-white/15"
                    >
                      {loading ? "Signing in..." : "Sign In"}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          </div>
        </Reveal>
      </div>
    </PageBackground>
  );
}
