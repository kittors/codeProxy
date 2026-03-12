import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ApiCallResult, AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { useToast } from "@/modules/ui/ToastProvider";
import { QuotaFileCard } from "@/modules/quota/QuotaFileCard";
import {
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CODEX_REQUEST_HEADERS,
  CODEX_USAGE_URL,
  DEFAULT_ANTIGRAVITY_PROJECT_ID,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  KIRO_QUOTA_URL,
  KIRO_REQUEST_HEADERS,
  KIRO_REQUEST_BODY,
  buildAntigravityGroups,
  buildCodexItems,
  buildGeminiCliBuckets,
  buildKiroItems,
  clampPercent,
  formatResetTime,
  isRecord,
  normalizeAuthIndexValue,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseCodexUsagePayload,
  parseGeminiCliQuotaPayload,
  parseKiroQuotaPayload,
  resolveAuthProvider,
  resolveCodexChatgptAccountId,
  resolveGeminiCliProjectId,
  type AntigravityModelsPayload,
  type QuotaItem,
  type QuotaState,
} from "@/modules/quota/quota-helpers";

// Provider icons
import iconAntigravity from "@/assets/icons/antigravity.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconKiro from "@/assets/icons/kiro.svg";

/* ─── Provider metadata ─── */
const PROVIDER_META: Record<
  string,
  { label: string; icon: { light: string; dark: string }; description: string }
> = {
  antigravity: {
    label: "Antigravity",
    icon: { light: iconAntigravity, dark: iconAntigravity },
    description: "Multiple API endpoint fallback",
  },
  codex: {
    label: "Codex",
    icon: { light: iconCodex, dark: iconCodex },
    description: "5h / weekly limits & code review",
  },
  "gemini-cli": {
    label: "Gemini CLI",
    icon: { light: iconGemini, dark: iconGemini },
    description: "Remaining by model group",
  },
  kiro: {
    label: "Kiro",
    icon: { light: iconKiro, dark: iconKiro },
    description: "AWS CodeWhisperer quota",
  },
};

/* ─── Resolve Antigravity project ID ─── */
const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const top = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (top) return top;
    const installed = isRecord(parsed.installed) ? (parsed.installed as Record<string, unknown>) : null;
    const installedId = installed ? normalizeStringValue(installed.project_id ?? installed.projectId) : null;
    if (installedId) return installedId;
    const web = isRecord(parsed.web) ? (parsed.web as Record<string, unknown>) : null;
    const webId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webId) return webId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }
  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

/* ─── Fetch quota ─── */
const fetchQuota = async (
  type: "antigravity" | "codex" | "gemini-cli" | "kiro",
  file: AuthFileItem,
): Promise<QuotaItem[]> => {
  const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) throw new Error("Missing auth_index");

  if (type === "antigravity") {
    const projectId = await resolveAntigravityProjectId(file);
    const requestBody = JSON.stringify({ project: projectId });
    let last: ApiCallResult | null = null;
    for (const url of ANTIGRAVITY_QUOTA_URLS) {
      const result = await apiCallApi.request({
        authIndex, method: "POST", url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS }, data: requestBody,
      });
      last = result;
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const parsed = parseAntigravityPayload(result.body ?? result.bodyText);
        const models = parsed?.models;
        if (!models || !isRecord(models)) throw new Error("No model quota data");
        const groups = buildAntigravityGroups(models as AntigravityModelsPayload);
        return groups.map((g) => ({
          label: g.label,
          percent: Math.round(clampPercent(g.remainingFraction * 100)),
          resetLabel: g.resetTime ? formatResetTime(g.resetTime) : "--",
        }));
      }
    }
    if (last) throw new Error(getApiCallErrorMessage(last));
    throw new Error("Request failed");
  }

  if (type === "codex") {
    const accountId = resolveCodexChatgptAccountId(file);
    if (!accountId) throw new Error("Missing Chatgpt-Account-Id");
    const result = await apiCallApi.request({
      authIndex, method: "GET", url: CODEX_USAGE_URL,
      header: { ...CODEX_REQUEST_HEADERS, "Chatgpt-Account-Id": accountId },
    });
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(getApiCallErrorMessage(result));
    const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
    if (!payload) throw new Error("Failed to parse Codex quota");
    return buildCodexItems(payload);
  }

  if (type === "gemini-cli") {
    const projectId = resolveGeminiCliProjectId(file);
    if (!projectId) throw new Error("Missing Gemini CLI Project ID");
    const result = await apiCallApi.request({
      authIndex, method: "POST", url: GEMINI_CLI_QUOTA_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({ project: projectId }),
    });
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(getApiCallErrorMessage(result));
    const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
    const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];
    const parsed = buckets
      .map((bucket) => {
        const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
        if (!modelId) return null;
        const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
        const remainingFractionRaw = normalizeQuotaFraction(bucket.remainingFraction ?? bucket.remaining_fraction);
        const remainingAmount = normalizeNumberValue(bucket.remainingAmount ?? bucket.remaining_amount);
        const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
        let fallbackFraction: number | null = null;
        if (remainingAmount !== null) fallbackFraction = remainingAmount <= 0 ? 0 : null;
        else if (resetTime) fallbackFraction = 0;
        return { modelId, tokenType: tokenType ?? null, remainingFraction: remainingFractionRaw ?? fallbackFraction, remainingAmount, resetTime };
      })
      .filter(Boolean) as { modelId: string; tokenType: string | null; remainingFraction: number | null; remainingAmount: number | null; resetTime?: string }[];
    const grouped = buildGeminiCliBuckets(parsed);
    return grouped.map((b) => {
      const percent = b.remainingFraction === null ? null : Math.round(clampPercent(b.remainingFraction * 100));
      const amount = b.remainingAmount !== null ? `${Math.round(b.remainingAmount).toLocaleString()} tokens` : null;
      const tokenType = b.tokenType ? `tokenType=${b.tokenType}` : null;
      const meta = [tokenType, amount].filter(Boolean).join(" · ");
      return { label: b.label, percent, resetLabel: b.resetTime ? formatResetTime(b.resetTime) : "--", meta: meta || undefined };
    });
  }

  // kiro
  const result = await apiCallApi.request({
    authIndex, method: "POST", url: KIRO_QUOTA_URL,
    header: { ...KIRO_REQUEST_HEADERS }, data: KIRO_REQUEST_BODY,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(getApiCallErrorMessage(result));
  const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!payload) throw new Error("Failed to parse Kiro quota");
  return buildKiroItems(payload);
};

/* ═══════════════════════════════════════════ */

export function QuotaPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [antigravity, setAntigravity] = useState<Record<string, QuotaState>>({});
  const [codex, setCodex] = useState<Record<string, QuotaState>>({});
  const [geminiCli, setGeminiCli] = useState<Record<string, QuotaState>>({});
  const [kiro, setKiro] = useState<Record<string, QuotaState>>({});
  const hasAutoRefreshed = useRef(false);

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const data = await authFilesApi.list();
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Failed to load auth files" });
    } finally {
      setLoadingFiles(false);
    }
  }, [notify]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const grouped = useMemo(() => {
    const ag: AuthFileItem[] = [], cx: AuthFileItem[] = [], gm: AuthFileItem[] = [], kr: AuthFileItem[] = [];
    files.forEach((f) => {
      const p = resolveAuthProvider(f);
      if (p === "antigravity") ag.push(f);
      if (p === "codex") cx.push(f);
      if (p === "gemini-cli") gm.push(f);
      if (p === "kiro") kr.push(f);
    });
    return { ag, cx, gm, kr };
  }, [files]);

  const refreshOne = useCallback(
    async (type: "antigravity" | "codex" | "gemini-cli" | "kiro", file: AuthFileItem) => {
      const name = file.name;
      const setMap = type === "antigravity" ? setAntigravity : type === "codex" ? setCodex : type === "gemini-cli" ? setGeminiCli : setKiro;
      setMap((prev) => ({ ...prev, [name]: { status: "loading", items: [], updatedAt: Date.now() } }));
      try {
        const items = await fetchQuota(type, file);
        setMap((prev) => ({ ...prev, [name]: { status: "success", items, updatedAt: Date.now() } }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Quota query failed";
        setMap((prev) => ({ ...prev, [name]: { status: "error", items: [], error: message, updatedAt: Date.now() } }));
      }
    }, [],
  );

  const refreshAll = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    grouped.ag.forEach((f) => tasks.push(refreshOne("antigravity", f)));
    grouped.cx.forEach((f) => tasks.push(refreshOne("codex", f)));
    grouped.gm.forEach((f) => tasks.push(refreshOne("gemini-cli", f)));
    grouped.kr.forEach((f) => tasks.push(refreshOne("kiro", f)));
    if (!tasks.length) { notify({ type: "info", message: "No queryable auth files found" }); return; }
    startTransition(() => { void Promise.allSettled(tasks); });
  }, [grouped, notify, refreshOne, startTransition]);

  /* Auto-refresh on mount */
  useEffect(() => {
    if (loadingFiles || hasAutoRefreshed.current) return;
    const hasFiles = grouped.ag.length + grouped.cx.length + grouped.gm.length + grouped.kr.length > 0;
    if (!hasFiles) return;
    hasAutoRefreshed.current = true;
    void refreshAll();
  }, [loadingFiles, grouped, refreshAll]);

  /* ── Render provider section ── */
  const renderSection = (
    type: "antigravity" | "codex" | "gemini-cli" | "kiro",
    list: AuthFileItem[],
    stateMap: Record<string, QuotaState>,
  ) => {
    const meta = PROVIDER_META[type];
    return (
      <section key={type}>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-neutral-800/60">
              <img src={meta.icon.light} alt="" width={14} height={14} className="dark:hidden" />
              <img src={meta.icon.dark} alt="" width={14} height={14} className="hidden dark:block" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{meta.label}</h3>
            {list.length > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-500 dark:bg-neutral-800 dark:text-white/50">
                {list.length}
              </span>
            )}
            <span className="text-[11px] text-slate-400 dark:text-white/35">{meta.description}</span>
          </div>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => void Promise.all(list.map((f) => refreshOne(type, f)))}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>

        {list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-4 text-center dark:border-neutral-800">
            <p className="text-xs text-slate-400 dark:text-white/30">No matching auth files</p>
          </div>
        ) : (
          <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((file) => (
              <QuotaFileCard
                key={file.name}
                file={file}
                state={stateMap[file.name] ?? { status: "idle", items: [] }}
                onRefresh={() => void refreshOne(type, file)}
              />
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Quota Management
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => void refreshAll()} disabled={isPending || loadingFiles}>
            <RefreshCw size={13} className={isPending ? "animate-spin" : ""} />
            Refresh All
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void loadFiles()} disabled={loadingFiles}>
            <RefreshCw size={13} className={loadingFiles ? "animate-spin" : ""} />
            Refresh Files
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loadingFiles && (
        <div className="flex items-center justify-center py-8">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/80 dark:text-white/60">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-white/50 dark:border-t-transparent" />
            Loading auth files…
          </div>
        </div>
      )}

      {/* Sections */}
      {!loadingFiles && (
        <>
          {renderSection("antigravity", grouped.ag, antigravity)}
          {renderSection("codex", grouped.cx, codex)}
          {renderSection("gemini-cli", grouped.gm, geminiCli)}
          {renderSection("kiro", grouped.kr, kiro)}
        </>
      )}
    </div>
  );
}
