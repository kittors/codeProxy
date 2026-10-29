import type { AuthFileItem } from "./types";
import { parseDateLikeMs } from "./dateLike";

/**
 * 账号或模型为什么被暂停调度，原样是后端给的原因码（`restrictions[].cooldown_reason`、
 * `model_cooldowns[].reason`）。这些码是管理接口的一部分：后端只会新增、不会改名，所以不认识的码
 * 按「没有原因」显示，而不是猜一个意思。
 */
export const AUTH_FILE_COOLDOWN_REASONS = [
  "rate_limited",
  "quota_exhausted",
  "unauthorized",
  "token_refreshing",
  "reauth_required",
  "payment_required",
  "model_unavailable",
  "not_found",
  "upstream_error",
] as const;

export type AuthFileCooldownReason = (typeof AUTH_FILE_COOLDOWN_REASONS)[number];

const KNOWN_COOLDOWN_REASONS: ReadonlySet<string> = new Set(AUTH_FILE_COOLDOWN_REASONS);

export const normalizeCooldownReason = (value: unknown): AuthFileCooldownReason | null => {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return KNOWN_COOLDOWN_REASONS.has(key) ? (key as AuthFileCooldownReason) : null;
};

/**
 * 会自己恢复的暂停（令牌正在刷新）不该和「需要人处理」的错误一样红；其余原因沿用 HTTP 状态
 * 推出来的色调，所以只对这一种给出覆盖。
 */
export const resolveCooldownReasonTone = (
  reason: AuthFileCooldownReason | null,
): "warning" | null => (reason === "token_refreshing" ? "warning" : null);

export type AuthFileModelCooldownView = {
  model: string;
  /** 不认识的原因码为 null：界面只显示模型和剩余时间。 */
  reason: AuthFileCooldownReason | null;
  /** 暂停到何时；null 表示没有结束时间（例如额度要等探测确认才恢复）。 */
  untilMs: number | null;
  httpStatus: number | null;
};

/**
 * 账号上此刻被暂停的模型，读自列表里的 `model_cooldowns`。
 *
 * 旧后端没有这个字段：返回空数组，界面就不出现「立即重试」。列表是请求当时的快照，所以已经过了
 * 结束时间的条目直接丢掉——下一次刷新本来也不会再带上它们。
 */
export const resolveAuthFileModelCooldowns = (
  file: Pick<AuthFileItem, "model_cooldowns">,
  nowMs: number,
): AuthFileModelCooldownView[] => {
  const entries = file.model_cooldowns;
  if (!Array.isArray(entries)) return [];
  const byModel = new Map<string, AuthFileModelCooldownView>();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const model = typeof entry.model === "string" ? entry.model.trim() : "";
    if (!model || byModel.has(model)) continue;
    const untilMs = parseDateLikeMs(entry.until);
    if (untilMs !== null && untilMs <= nowMs) continue;
    const status = Number(entry.http_status);
    byModel.set(model, {
      model,
      reason: normalizeCooldownReason(entry.reason),
      untilMs,
      httpStatus: Number.isFinite(status) && status > 0 ? Math.round(status) : null,
    });
  }
  return [...byModel.values()];
};

/**
 * 剩余时间，最多保留最大的两个单位（「1h 5m」而不是「1h 5m 3s」）：徽章和菜单里放不下整串。
 * 单位文案由调用方传入，保持和其它剩余时间同一套翻译。
 */
export const formatCooldownRemaining = (
  untilMs: number,
  nowMs: number,
  labels: { day: string; hour: string; minute: string; second: string } = {
    day: "d",
    hour: "h",
    minute: "m",
    second: "s",
  },
): string => {
  let seconds = Math.max(1, Math.ceil((untilMs - nowMs) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}${labels.day}`);
  if (hours) parts.push(`${hours}${labels.hour}`);
  if (minutes) parts.push(`${minutes}${labels.minute}`);
  if (seconds) parts.push(`${seconds}${labels.second}`);
  return parts.slice(0, 2).join(" ");
};
