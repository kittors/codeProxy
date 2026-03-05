import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { configApi } from "@/lib/http/apis";
import { useAuth } from "@/modules/auth/AuthProvider";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { useToast } from "@/modules/ui/ToastProvider";

const buildV1ModelsUrl = (apiBase: string): string => {
  const normalized = apiBase.trim().replace(/\/+$/g, "");
  if (!normalized) return "";
  return `${normalized}/v1/models`;
};

const normalizeApiKeys = (raw: unknown): string[] => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [];
  const keys = list.map((item) => String(item ?? "").trim()).filter(Boolean);
  return Array.from(new Set(keys));
};

type V1ModelsResponse =
  | { data?: Array<{ id?: string }> }
  | { models?: Array<{ id?: string }> }
  | Array<{ id?: string }>
  | Record<string, unknown>;

const extractModelIds = (payload: V1ModelsResponse): string[] => {
  const data = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data as Array<{ id?: string }>)
      : Array.isArray((payload as { models?: unknown }).models)
        ? ((payload as { models: unknown[] }).models as Array<{ id?: string }>)
        : [];

  const ids = data
    .map((item) => (item && typeof item === "object" ? String((item as { id?: unknown }).id) : ""))
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
};

const copyToClipboard = async (value: string) => {
  if (!value.trim()) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
};

const AUTO_REFRESH_INTERVAL = 30_000;

export function SystemPage() {
  const { notify } = useToast();
  const auth = useAuth();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  const configApiKeys = useMemo(() => {
    const record = config ?? {};
    const keys = (record["api-keys"] ?? record.apiKeys ?? record.keys) as unknown;
    return normalizeApiKeys(keys);
  }, [config]);

  const primaryApiKey = configApiKeys[0] ?? "";
  const modelsUrl = useMemo(() => buildV1ModelsUrl(auth.state.apiBase), [auth.state.apiBase]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const data = await configApi.getConfig();
      const record = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      setConfig(record);
    } catch {
      // silent
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      if (!modelsUrl) {
        throw new Error("API Base 为空，无法加载模型列表");
      }

      const headers: HeadersInit = {};
      if (primaryApiKey) {
        headers.Authorization = `Bearer ${primaryApiKey}`;
      }

      const response = await fetch(modelsUrl, { headers });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text.trim() || `请求失败（${response.status}）`);
      }

      const payload = (await response.json()) as V1ModelsResponse;
      setModels(extractModelIds(payload));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "加载模型失败";
      setModelsError(message);
    } finally {
      setModelsLoading(false);
    }
  }, [modelsUrl, primaryApiKey]);

  // Auto-load config + models on mount
  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!loadingConfig && modelsUrl) {
      void loadModels();
    }
  }, [loadingConfig, modelsUrl, loadModels]);

  // Auto-refresh models every 30s
  useEffect(() => {
    if (!modelsUrl) return;
    const timer = setInterval(() => {
      void loadModels();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [modelsUrl, loadModels]);

  const filteredModels = useMemo(() => {
    const needle = modelFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((id) => id.toLowerCase().includes(needle));
  }, [modelFilter, models]);

  const infoRows: Array<{ label: string; value: string }> = [
    { label: "API Base", value: auth.state.apiBase || "--" },
    { label: "管理接口", value: auth.meta.managementEndpoint || "--" },
    { label: "服务版本", value: auth.state.serverVersion ?? "--" },
    { label: "构建时间", value: auth.state.serverBuildDate ?? "--" },
    { label: "前端版本", value: __APP_VERSION__ || "--" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          系统
        </h2>
      </div>

      {/* Connection & Version Info */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-neutral-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">连接与版本</h3>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void copyToClipboard(auth.state.apiBase)}
          >
            <Copy size={14} />
            复制地址
          </Button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-neutral-800">
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm"
            >
              <span className="text-slate-500 dark:text-white/55">{row.label}</span>
              <span className="truncate font-mono text-xs text-slate-800 dark:text-white/80">
                {row.value}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
            <span className="text-slate-500 dark:text-white/55">API Key 查询</span>
            <a
              href={`${window.location.origin}/manage/apikey-lookup`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-mono text-xs text-indigo-600 underline decoration-indigo-600/30 hover:text-indigo-500 hover:decoration-indigo-500/50 dark:text-indigo-400 dark:decoration-indigo-400/30 dark:hover:text-indigo-300"
            >
              {`${window.location.origin}/manage/apikey-lookup`}
            </a>
          </div>
        </div>
      </div>

      {/* Model List */}
      <div className="rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">可用模型</h3>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
              {filteredModels.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              placeholder="搜索模型…"
              className="!w-44 !rounded-lg !py-1 !text-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              <RefreshCw size={14} className={modelsLoading ? "animate-spin" : ""} />
              刷新
            </Button>
          </div>
        </div>

        {modelsError ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {modelsError}
          </div>
        ) : null}

        <div className="max-h-[420px] overflow-y-auto">
          {modelsLoading && models.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">
              加载中…
            </div>
          ) : filteredModels.length > 0 ? (
            <div className="divide-y divide-slate-50 dark:divide-neutral-800/50">
              {filteredModels.map((id, idx) => (
                <div
                  key={id}
                  className="flex items-center gap-3 px-5 py-2 text-sm hover:bg-slate-50/50 dark:hover:bg-white/[0.02]"
                >
                  <span className="w-8 text-right tabular-nums text-xs text-slate-400 dark:text-white/30">
                    {idx + 1}
                  </span>
                  <span className="truncate font-mono text-xs text-slate-800 dark:text-white/85">
                    {id}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-white/50">
              {models.length === 0 ? "暂无模型数据" : "无匹配结果"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

