import type { PoolCapacityEntry } from "@code-proxy/api-client";
import { resolveProviderLabel } from "@code-proxy/domain";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * 池里最旧的观测早于这个时间，就标「数据可能已过期」。取 6 小时：后端估消耗速度也是看近 6 小时的
 * 样本，更旧的观测既说不清现在还剩多少，也估不出速度。
 */
export const POOL_STALE_AFTER_MS = 6 * HOUR_MS;

/** 窗口的名字，面板认得的 key（见 CliRelay aiaccountstatus 的 accountWideWindowKeys）。 */
export const KNOWN_WINDOW_KEYS = [
  "code_5h",
  "five_hour",
  "code_week",
  "seven_day",
  "weekly_limit",
  "monthly_credits",
  "base_quota",
  "trial_quota",
] as const;

/** 商标名不翻译。没登记的服务商回落到把 key 首字母大写的写法，新增的服务商不会因此消失。 */
const PROVIDER_NAMES: Record<string, string> = {
  antigravity: "Antigravity",
  claude: "Claude",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  gemini: "Gemini",
  iflow: "iFlow",
  kimi: "Kimi",
  kiro: "Kiro",
  qwen: "Qwen",
  vertex: "Vertex AI",
  xai: "Grok",
};

export const providerDisplayName = (provider: string): string =>
  PROVIDER_NAMES[provider.trim().toLowerCase()] ?? resolveProviderLabel(provider);

/** 配色分档和额度条一致：剩 60% 以上正常，20% 以上提醒，再少就是危险。 */
export type PoolTone = "healthy" | "warning" | "danger" | "unknown";

export type PoolProjection =
  /** 按近期速度，重置前会用完。 */
  | { kind: "exhaustion"; atMs: number }
  /** 有消耗速度的估计，而且重置前用不完。 */
  | { kind: "safe" };

export interface PoolRow {
  id: string;
  provider: string;
  providerName: string;
  windowKey: string;
  /** 后端给的上游原名，面板没有这个 key 的名字时用它。 */
  windowLabel: string;
  windowSeconds: number;
  /** 没有任何账号有数据时是 null：此时没有「剩多少」可说。 */
  remainingPercent: number | null;
  tone: PoolTone;
  resetAtMs?: number;
  projection: PoolProjection | null;
  /** 只在有账号缺数据时给出，说明这个数是按几个账号平均的。 */
  coverage: { withData: number; total: number } | null;
  observedAtMs?: number;
  stale: boolean;
}

const parseTime = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
};

export const poolTone = (remainingPercent: number | null): PoolTone => {
  if (remainingPercent === null) return "unknown";
  if (remainingPercent >= 60) return "healthy";
  if (remainingPercent >= 20) return "warning";
  return "danger";
};

function projectionOf(pool: PoolCapacityEntry, nowMs: number): PoolProjection | null {
  const exhaustionMs = parseTime(pool.projected_exhaustion_at);
  if (exhaustionMs !== undefined) {
    // 已经过去的预测说明快照是旧的，写「某时用完」只会误导。
    return exhaustionMs > nowMs ? { kind: "exhaustion", atMs: exhaustionMs } : null;
  }
  // 后端只在「重置前会用完」时才给 projected_exhaustion_at。「没给」要分两种：估出了速度而且用不完，
  // 或者根本没估出来（样本不够、不知道什么时候重置）。只有前一种能写「用不完」，后一种什么都不写，
  // 不能把「不知道」说成「安全」。
  const hasEstimate =
    typeof pool.burn_percent_per_hour === "number" && Number.isFinite(pool.burn_percent_per_hour);
  return hasEstimate && parseTime(pool.earliest_reset_at) !== undefined ? { kind: "safe" } : null;
}

/** 最紧的池排最前，没有数据的排最后；同样紧时按服务商名、窗口长短排，顺序不随刷新乱跳。 */
export function buildPoolRows(pools: PoolCapacityEntry[], nowMs: number): PoolRow[] {
  const rows = pools.map<PoolRow>((pool) => {
    const hasData = pool.accounts_with_data > 0 && Number.isFinite(pool.remaining_percent);
    const remainingPercent = hasData ? Math.min(100, Math.max(0, pool.remaining_percent)) : null;
    const observedAtMs = parseTime(pool.observed_at);
    return {
      id: `${pool.provider}:${pool.window_key}`,
      provider: pool.provider,
      providerName: providerDisplayName(pool.provider),
      windowKey: pool.window_key,
      windowLabel: pool.window_label,
      windowSeconds: pool.window_seconds,
      remainingPercent,
      tone: poolTone(remainingPercent),
      resetAtMs: parseTime(pool.earliest_reset_at),
      projection: remainingPercent === null ? null : projectionOf(pool, nowMs),
      coverage:
        pool.accounts_with_data > 0 && pool.accounts_with_data < pool.accounts
          ? { withData: pool.accounts_with_data, total: pool.accounts }
          : null,
      observedAtMs,
      stale: observedAtMs !== undefined && nowMs - observedAtMs > POOL_STALE_AFTER_MS,
    };
  });
  return rows.sort((a, b) => {
    if (a.remainingPercent === null || b.remainingPercent === null) {
      if (a.remainingPercent === b.remainingPercent) return a.id.localeCompare(b.id);
      return a.remainingPercent === null ? 1 : -1;
    }
    return (
      a.remainingPercent - b.remainingPercent ||
      a.providerName.localeCompare(b.providerName) ||
      a.windowSeconds - b.windowSeconds
    );
  });
}

/** 「2 天后」「36 小时后」「3 小时前」：精确到分钟没有意义，只要知道量级。 */
export function formatRelativeTime(targetMs: number, nowMs: number, locale: string): string {
  const deltaMs = targetMs - nowMs;
  const sign = deltaMs < 0 ? -1 : 1;
  const minutes = Math.max(1, Math.round(Math.abs(deltaMs) / MINUTE_MS));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  let text: string;
  if (minutes < 60) {
    text = formatter.format(sign * minutes, "minute");
  } else {
    const hours = Math.round(minutes / 60);
    text =
      hours < 48
        ? formatter.format(sign * hours, "hour")
        : formatter.format(sign * Math.round(hours / 24), "day");
  }
  // 中文里数字和汉字之间留一格（和界面其它文案一致），Intl 给的是「2天后」。
  return /^zh/i.test(locale) ? text.replace(/(\d)(?=[\u4e00-\u9fff])/g, "$1 ") : text;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * 「今天 14:00」「明天 14:00」「周四 14:00」，一周以后写日期。预计用完一定在重置之前，窗口最长是一周
 * 或一个月，所以只有月度窗口才会走到日期这一档。
 */
export function formatClockTime(targetMs: number, nowMs: number, locale: string): string {
  const target = new Date(targetMs);
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(
    target,
  );
  const dayDiff = Math.round((startOfDay(target) - startOfDay(new Date(nowMs))) / DAY_MS);
  if (dayDiff === 0 || dayDiff === 1) {
    return `${new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(dayDiff, "day")} ${time}`;
  }
  const day =
    dayDiff > 1 && dayDiff < 7
      ? new Intl.DateTimeFormat(locale, { weekday: "short" }).format(target)
      : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(target);
  return `${day} ${time}`;
}
