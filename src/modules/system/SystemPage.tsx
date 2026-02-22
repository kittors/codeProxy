import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Info, RefreshCw, Trash2 } from "lucide-react";
import { AUTH_STORAGE_KEY } from "@/lib/constants";
import { configApi } from "@/lib/http/apis";
import { useAuth } from "@/modules/auth/AuthProvider";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
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
    // 忽略复制失败
  }
};

export function SystemPage() {
  const { notify } = useToast();
  const auth = useAuth();

  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("");

  const [confirm, setConfirm] = useState<null | { type: "clear-login" }>(null);

  const configApiKeys = useMemo(() => {
    const record = config ?? {};
    const keys = (record["api-keys"] ?? record.apiKeys ?? record.keys) as unknown;
    return normalizeApiKeys(keys);
  }, [config]);

  const primaryApiKey = configApiKeys[0] ?? "";
  const modelsUrl = useMemo(() => buildV1ModelsUrl(auth.state.apiBase), [auth.state.apiBase]);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const data = await configApi.getConfig();
      const record = data && typeof data === "object" && !Array.isArray(data) ? data : null;
      setConfig(record);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "加载配置失败";
      setConfigError(message);
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
      notify({ type: "error", message });
    } finally {
      setModelsLoading(false);
    }
  }, [modelsUrl, primaryApiKey, notify]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const filteredModels = useMemo(() => {
    const needle = modelFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((id) => id.toLowerCase().includes(needle));
  }, [modelFilter, models]);

  const handleClearLoginStorage = () => {
    setConfirm({ type: "clear-login" });
  };

  const clearLoginStorage = () => {
    auth.actions.logout();
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
    notify({ type: "success", message: "已清理登录信息" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            系统信息
          </h2>
          <p className="text-sm text-slate-600 dark:text-white/65">
            连接信息、版本信息与模型列表（不改 UI 风格，只补齐业务能力）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadConfig()}
            disabled={loadingConfig}
          >
            <RefreshCw size={14} />
            刷新配置
          </Button>
          <Button variant="danger" size="sm" onClick={handleClearLoginStorage}>
            <Trash2 size={14} />
            清理登录信息
          </Button>
        </div>
      </div>

      {configError ? (
        <EmptyState
          title="加载失败"
          description={configError}
          icon={<Info size={18} />}
          action={
            <Button variant="secondary" onClick={() => void loadConfig()}>
              <RefreshCw size={14} />
              重试
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="连接与版本"
          description="用于确认连接状态与后端版本，便于排查环境问题。"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void copyToClipboard(auth.state.apiBase)}
            >
              <Copy size={14} />
              复制 API Base
            </Button>
          }
        >
          <div className="space-y-3 text-sm text-slate-700 dark:text-white/80">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-white/55">API Base</span>
              <span className="font-mono text-xs">{auth.state.apiBase || "--"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-white/55">管理接口</span>
              <span className="font-mono text-xs">{auth.meta.managementEndpoint || "--"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-white/55">服务版本</span>
              <span className="font-mono text-xs">{auth.state.serverVersion ?? "--"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-white/55">构建时间</span>
              <span className="font-mono text-xs">{auth.state.serverBuildDate ?? "--"}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-white/55">前端版本</span>
              <span className="font-mono text-xs">{__APP_VERSION__ || "--"}</span>
            </div>
          </div>
        </Card>

        <Card
          title="模型列表（/v1/models）"
          description="从代理服务读取可用模型列表。若服务要求 API Key，会使用配置中的第一个 key。"
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadModels()}
              disabled={modelsLoading || loadingConfig}
            >
              <RefreshCw size={14} />
              刷新模型
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-slate-500 dark:text-white/55">模型筛选</div>
                <TextInput
                  value={modelFilter}
                  onChange={(event) => setModelFilter(event.target.value)}
                  placeholder="例如：gpt / claude / gemini"
                />
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80">
                <div className="text-xs text-slate-500 dark:text-white/55">API Keys</div>
                <div className="mt-1 font-mono text-xs">
                  {loadingConfig ? "加载中…" : primaryApiKey ? "已配置（隐藏）" : "未配置"}
                </div>
              </div>
            </div>

            {modelsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                {modelsError}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-white/55">
                <span>共 {filteredModels.length} 个</span>
                <span className="font-mono">{modelsUrl || "--"}</span>
              </div>
              <div className="mt-3 max-h-80 overflow-auto">
                {modelsLoading ? (
                  <div className="py-6 text-center text-sm text-slate-600 dark:text-white/65">
                    加载中…
                  </div>
                ) : filteredModels.length ? (
                  <ul className="space-y-1">
                    {filteredModels.map((id) => (
                      <li
                        key={id}
                        className="rounded-xl px-2 py-1 font-mono text-xs text-slate-800 hover:bg-slate-50 dark:text-white/85 dark:hover:bg-white/5"
                      >
                        {id}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-6 text-center text-sm text-slate-600 dark:text-white/65">
                    暂无模型数据
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <ConfirmModal
        open={confirm?.type === "clear-login"}
        title="确认清理登录信息？"
        description="此操作会退出登录并清理本地存储的连接信息。"
        confirmText="清理"
        cancelText="取消"
        variant="danger"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          clearLoginStorage();
        }}
      />
    </div>
  );
}
