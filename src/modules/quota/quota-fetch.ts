import { apiCallApi, authFilesApi, getApiCallErrorMessage } from "@/lib/http/apis";
import type { ApiCallResult, AuthFileItem } from "@/lib/http/types";
import {
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CODEX_REQUEST_HEADERS,
  CODEX_USAGE_URL,
  DEFAULT_ANTIGRAVITY_PROJECT_ID,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  KIMI_REQUEST_HEADERS,
  KIMI_USAGE_URL,
  KIRO_QUOTA_URL,
  KIRO_REQUEST_BODY,
  KIRO_REQUEST_HEADERS,
  buildAntigravityGroups,
  buildCodexItems,
  buildGeminiCliBuckets,
  buildKimiItems,
  buildKiroItems,
  clampPercent,
  isRecord,
  normalizeAuthIndexValue,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseCodexUsagePayload,
  parseGeminiCliQuotaPayload,
  parseKimiUsagePayload,
  parseKiroQuotaPayload,
  parseResetTimeToMs,
  resolveAuthProvider,
  resolveCodexChatgptAccountId,
  resolveGeminiCliProjectId,
  type AntigravityModelsPayload,
  type QuotaItem,
} from "@/modules/quota/quota-helpers";

export type QuotaProvider = "antigravity" | "codex" | "gemini-cli" | "kimi" | "kiro";
export type QuotaFetchResult = {
  items: QuotaItem[];
  planType?: string | null;
};

export const resolveQuotaProvider = (file: AuthFileItem): QuotaProvider | null => {
  const provider = resolveAuthProvider(file);
  if (provider === "antigravity") return "antigravity";
  if (provider === "codex") return "codex";
  if (provider === "gemini-cli") return "gemini-cli";
  if (provider === "kimi") return "kimi";
  if (provider === "kiro") return "kiro";
  return null;
};

export const isQuotaSupportedAuthFile = (file: AuthFileItem): boolean =>
  resolveQuotaProvider(file) !== null;

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

export const fetchQuota = async (
  type: QuotaProvider,
  file: AuthFileItem,
): Promise<QuotaFetchResult> => {
  const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) throw new Error("missing_auth_index");

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
        if (!models || !isRecord(models)) throw new Error("no_model_quota");
        const groups = buildAntigravityGroups(models as AntigravityModelsPayload);
        return {
          items: groups.map((g) => ({
            label: g.label,
            percent: Math.round(clampPercent(g.remainingFraction * 100)),
            resetAtMs: parseResetTimeToMs(g.resetTime),
          })),
        };
      }
    }
    if (last) throw new Error(getApiCallErrorMessage(last));
    throw new Error("request_failed");
  }

  if (type === "codex") {
    const accountId = resolveCodexChatgptAccountId(file);
    if (!accountId) throw new Error("missing_account_id");
    const result = await apiCallApi.request({
      authIndex,
      method: "GET",
      url: CODEX_USAGE_URL,
      header: { ...CODEX_REQUEST_HEADERS, "Chatgpt-Account-Id": accountId },
    });
    if (result.statusCode < 200 || result.statusCode >= 300)
      throw new Error(getApiCallErrorMessage(result));
    const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
    if (!payload) throw new Error("parse_codex_failed");
    return {
      items: buildCodexItems(payload),
      planType: normalizeStringValue(payload.plan_type ?? payload.planType)?.toLowerCase() ?? null,
    };
  }

  if (type === "gemini-cli") {
    const projectId = resolveGeminiCliProjectId(file);
    if (!projectId) throw new Error("missing_project_id");
    const result = await apiCallApi.request({
      authIndex,
      method: "POST",
      url: GEMINI_CLI_QUOTA_URL,
      header: { ...GEMINI_CLI_REQUEST_HEADERS },
      data: JSON.stringify({ project: projectId }),
    });
    if (result.statusCode < 200 || result.statusCode >= 300)
      throw new Error(getApiCallErrorMessage(result));
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
        if (remainingAmount !== null) fallbackFraction = remainingAmount <= 0 ? 0 : null;
        else if (resetTime) fallbackFraction = 0;
        return {
          modelId,
          tokenType: tokenType ?? null,
          remainingFraction: remainingFractionRaw ?? fallbackFraction,
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
    return {
      items: grouped.map((b) => {
        const percent =
          b.remainingFraction === null ? null : Math.round(clampPercent(b.remainingFraction * 100));
        const amount =
          b.remainingAmount !== null
            ? `${Math.round(b.remainingAmount).toLocaleString()} tokens`
            : null;
        const tokenType = b.tokenType ? `tokenType=${b.tokenType}` : null;
        const meta = [tokenType, amount].filter(Boolean).join(" · ");
        return {
          label: b.label,
          percent,
          resetAtMs: parseResetTimeToMs(b.resetTime),
          meta: meta || undefined,
        };
      }),
    };
  }

  if (type === "kimi") {
    const result = await apiCallApi.request({
      authIndex,
      method: "GET",
      url: KIMI_USAGE_URL,
      header: { ...KIMI_REQUEST_HEADERS },
    });
    if (result.statusCode < 200 || result.statusCode >= 300)
      throw new Error(getApiCallErrorMessage(result));
    const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
    if (!payload) throw new Error("parse_kimi_failed");
    return { items: buildKimiItems(payload) };
  }

  const result = await apiCallApi.request({
    authIndex,
    method: "POST",
    url: KIRO_QUOTA_URL,
    header: { ...KIRO_REQUEST_HEADERS },
    data: KIRO_REQUEST_BODY,
  });
  if (result.statusCode < 200 || result.statusCode >= 300)
    throw new Error(getApiCallErrorMessage(result));
  const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!payload) throw new Error("parse_kiro_failed");
  return { items: buildKiroItems(payload) };
};
