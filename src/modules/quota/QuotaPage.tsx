import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ApiCallResult, AuthFileItem } from "@/lib/http/types";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
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

const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const top = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (top) return top;

    const installed = isRecord(parsed.installed)
      ? (parsed.installed as Record<string, unknown>)
      : null;
    const installedId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedId) return installedId;

    const web = isRecord(parsed.web) ? (parsed.web as Record<string, unknown>) : null;
    const webId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webId) return webId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }
  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const fetchQuota = async (
  type: "antigravity" | "codex" | "gemini-cli" | "kiro",
  file: AuthFileItem,
): Promise<QuotaItem[]> => {
  const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) {
    throw new Error("缺少 auth_index");
  }

  if (type === "antigravity") {
    const projectId = await resolveAntigravityProjectId(file);
    const requestBody = JSON.stringify({ project: projectId });

    let last: ApiCallResult | null = null;
    for (const url of ANTIGRAVITY_QUOTA_URLS) {
      const result = await apiCallApi.request({
        authIndex,
        method: "POST",
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });
      last = result;
      if (result.statusCode >= 200 && result.statusCode < 300) {
        const parsed = parseAntigravityPayload(result.body ?? result.bodyText);
        const models = parsed?.models;
        if (!models || !isRecord(models)) {
          throw new Error("未获取到可用模型配额数据");
        }
        const groups = buildAntigravityGroups(models as AntigravityModelsPayload);
        return groups.map((group) => ({
          label: group.label,
          percent: Math.round(clampPercent(group.remainingFraction * 100)),
          resetLabel: group.resetTime ? formatResetTime(group.resetTime) : "--",
        }));
      }
    }
    if (last) {
      throw new Error(getApiCallErrorMessage(last));
    }
    throw new Error("请求失败");
  }

  if (type === "codex") {
    const accountId = resolveCodexChatgptAccountId(file);
    if (!accountId) {
      throw new Error("缺少 Chatgpt-Account-Id（请检查 codex 认证文件是否包含 id_token）");
    }
    const result = await apiCallApi.request({
      authIndex,
      method: "GET",
      url: CODEX_USAGE_URL,
      header: { ...CODEX_REQUEST_HEADERS, "Chatgpt-Account-Id": accountId },
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
    if (!payload) {
      throw new Error("解析 Codex 配额失败");
    }
    return buildCodexItems(payload);
  }

  if (type === "gemini-cli") {
    const projectId = resolveGeminiCliProjectId(file);
    if (!projectId) {
      throw new Error("缺少 Gemini CLI Project ID（请检查 account 字段）");
    }
    const result = await apiCallApi.request({
      authIndex,
      method: "POST",
      url: GEMINI_CLI_QUOTA_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({ project: projectId }),
    });
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new Error(getApiCallErrorMessage(result));
    }
    const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
    const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];
    const parsed = buckets
      .map((bucket) => {
        const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
        if (!modelId) return null;
        const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
        const remainingFractionRaw = normalizeQuotaFraction(
          bucket.remainingFraction ?? bucket.remaining_fraction,
        );
        const remainingAmount = normalizeNumberValue(
          bucket.remainingAmount ?? bucket.remaining_amount,
        );
        const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
        let fallbackFraction: number | null = null;
        if (remainingAmount !== null) {
          fallbackFraction = remainingAmount <= 0 ? 0 : null;
        } else if (resetTime) {
          fallbackFraction = 0;
        }
        const remainingFraction = remainingFractionRaw ?? fallbackFraction;
        return {
          modelId,
          tokenType: tokenType ?? null,
          remainingFraction,
          remainingAmount,
          resetTime,
        };
      })
      .filter(Boolean) as {
      modelId: string;
      tokenType: string | null;
      remainingFraction: number | null;
      remainingAmount: number | null;
      resetTime?: string;
    }[];

    const grouped = buildGeminiCliBuckets(parsed);
    return grouped.map((bucket) => {
      const percent =
        bucket.remainingFraction === null
          ? null
          : Math.round(clampPercent(bucket.remainingFraction * 100));
      const amount =
        bucket.remainingAmount !== null
          ? `${Math.round(bucket.remainingAmount).toLocaleString()} tokens`
          : null;
      const tokenType = bucket.tokenType ? `tokenType=${bucket.tokenType}` : null;
      const meta = [tokenType, amount].filter(Boolean).join(" · ");
      return {
        label: bucket.label,
        percent,
        resetLabel: bucket.resetTime ? formatResetTime(bucket.resetTime) : "--",
        meta: meta || undefined,
      };
    });
  }

  const result = await apiCallApi.request({
    authIndex,
    method: "POST",
    url: KIRO_QUOTA_URL,
    header: { ...KIRO_REQUEST_HEADERS },
    data: KIRO_REQUEST_BODY,
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(getApiCallErrorMessage(result));
  }
  const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error("解析 Kiro 配额失败");
  }
  return buildKiroItems(payload);
};

export function QuotaPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  const [antigravity, setAntigravity] = useState<Record<string, QuotaState>>({});
  const [codex, setCodex] = useState<Record<string, QuotaState>>({});
  const [geminiCli, setGeminiCli] = useState<Record<string, QuotaState>>({});
  const [kiro, setKiro] = useState<Record<string, QuotaState>>({});

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const data = await authFilesApi.list();
      setFiles(Array.isArray(data?.files) ? data.files : []);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "加载认证文件失败" });
    } finally {
      setLoadingFiles(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const grouped = useMemo(() => {
    const ag: AuthFileItem[] = [];
    const cx: AuthFileItem[] = [];
    const gm: AuthFileItem[] = [];
    const kr: AuthFileItem[] = [];
    files.forEach((file) => {
      const provider = resolveAuthProvider(file);
      if (provider === "antigravity") ag.push(file);
      if (provider === "codex") cx.push(file);
      if (provider === "gemini-cli") gm.push(file);
      if (provider === "kiro") kr.push(file);
    });
    return { ag, cx, gm, kr };
  }, [files]);

  const refreshOne = useCallback(
    async (type: "antigravity" | "codex" | "gemini-cli" | "kiro", file: AuthFileItem) => {
      const name = file.name;
      const setMap =
        type === "antigravity"
          ? setAntigravity
          : type === "codex"
            ? setCodex
            : type === "gemini-cli"
              ? setGeminiCli
              : setKiro;

      setMap((prev) => ({
        ...prev,
        [name]: { status: "loading", items: [], updatedAt: Date.now() },
      }));

      try {
        const items = await fetchQuota(type, file);
        setMap((prev) => ({
          ...prev,
          [name]: { status: "success", items, updatedAt: Date.now() },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "额度查询失败";
        setMap((prev) => ({
          ...prev,
          [name]: { status: "error", items: [], error: message, updatedAt: Date.now() },
        }));
      }
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    grouped.ag.forEach((file) => tasks.push(refreshOne("antigravity", file)));
    grouped.cx.forEach((file) => tasks.push(refreshOne("codex", file)));
    grouped.gm.forEach((file) => tasks.push(refreshOne("gemini-cli", file)));
    grouped.kr.forEach((file) => tasks.push(refreshOne("kiro", file)));

    if (!tasks.length) {
      notify({ type: "info", message: "未发现可查询额度的认证文件" });
      return;
    }

    startTransition(() => {
      void Promise.allSettled(tasks).then(() => {
        notify({ type: "success", message: "额度刷新完成（部分失败请查看错误提示）" });
      });
    });
  }, [grouped, notify, refreshOne, startTransition]);

  const renderSection = (
    title: string,
    description: string,
    list: AuthFileItem[],
    stateMap: Record<string, QuotaState>,
    type: "antigravity" | "codex" | "gemini-cli" | "kiro",
  ) => (
    <Card
      title={title}
      description={description}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void Promise.all(list.map((f) => refreshOne(type, f)))}
        >
          <RefreshCw size={14} />
          刷新本组
        </Button>
      }
      loading={loadingFiles}
    >
      {list.length === 0 ? (
        <EmptyState
          title="暂无对应认证文件"
          description="请先在“认证文件”页面上传/生成对应 provider 的认证文件。"
        />
      ) : (
        <div className="space-y-3">
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
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => void refreshAll()}
          disabled={isPending || loadingFiles}
        >
          <RefreshCw size={14} className={isPending ? "animate-spin" : ""} />
          一键刷新所有额度
        </Button>
        <Button variant="secondary" onClick={() => void loadFiles()} disabled={loadingFiles}>
          <RefreshCw size={14} className={loadingFiles ? "animate-spin" : ""} />
          刷新文件列表
        </Button>
      </div>

      {renderSection(
        "Antigravity",
        "支持多个 API 端点回退。",
        grouped.ag,
        antigravity,
        "antigravity",
      )}
      {renderSection("Codex", "展示 5 小时 / 周限额与代码审查窗口。", grouped.cx, codex, "codex")}
      {renderSection(
        "Gemini CLI",
        "按模型组聚合 bucket 并展示剩余额度。",
        grouped.gm,
        geminiCli,
        "gemini-cli",
      )}
      {renderSection(
        "Kiro",
        "查询 AWS CodeWhisperer / Kiro 使用额度与重置时间。",
        grouped.kr,
        kiro,
        "kiro",
      )}
    </div>
  );
}
