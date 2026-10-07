import type {
  CodexFingerprintRecommendation,
  CodexIdentityFingerprint,
} from "@code-proxy/api-client/endpoints/identity-fingerprint";

const isManagedBetaHeader = (key: string) => key.toLowerCase() === "x-codex-beta-features";

/** X-Codex-Beta-Features 有专门的字段，从推荐的自定义请求头里剔除，避免同一个头写两处。 */
export function withoutManagedCodexBetaFeatures(headers: Record<string, string> | undefined) {
  return Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => !isManagedBetaHeader(key)));
}

export function readManagedCodexBetaFeatures(headers: Record<string, string> | undefined) {
  return Object.entries(headers ?? {}).find(([key]) => isManagedBetaHeader(key))?.[1];
}

/**
 * 应用一条推荐后写进配置的完整 Codex 指纹。
 *
 * 除了推荐里带的客户端字段，还会：打开 Codex 指纹、会话改为推荐的模式（默认每次请求随机）
 * 并清空固定的 Session ID、自定义请求头整体换成推荐的那一份。确认框里「会改哪些」也从这里推出，
 * 预览与实际写入共用这一份逻辑——以前预览只比了四个字段，会话设置被重置、旧请求头被删掉都看不到。
 */
export function codexFromRecommendation(
  current: Required<CodexIdentityFingerprint>,
  recommendation: CodexFingerprintRecommendation,
): Required<CodexIdentityFingerprint> {
  const recommended = recommendation.recommended;
  const betaFeatures =
    recommended["x-codex-beta-features"] ||
    readManagedCodexBetaFeatures(recommended["custom-headers"]);
  const nextCustomHeaders = withoutManagedCodexBetaFeatures(recommended["custom-headers"]);
  const next: Required<CodexIdentityFingerprint> = {
    ...current,
    enabled: true,
    "session-mode": recommended["session-mode"] ?? "per-request",
    "session-id": "",
    "custom-headers": nextCustomHeaders,
  };
  if (recommended["user-agent"]) next["user-agent"] = recommended["user-agent"];
  if (recommended.version) next.version = recommended.version;
  if (recommended.originator) next.originator = recommended.originator;
  if (recommended["websocket-beta"]) next["websocket-beta"] = recommended["websocket-beta"];
  if (betaFeatures) next["x-codex-beta-features"] = betaFeatures;
  return next;
}
