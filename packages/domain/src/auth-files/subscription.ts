import type { AuthFileItem, AuthFileSharedSubscription, AuthFileSubscriptionPeriod } from "./types";
import { parseDateLikeMs } from "./dateLike";

/**
 * Where a card's subscription dates come from, in the order they win:
 * - live: the provider's billing, read by the backend about once a day (status
 *   source "probe"; Codex accounts/check). What the provider will charge and end.
 * - manual: the start time and period typed on this tenant's auth file.
 * - claims: a snapshot the provider wrote into an OAuth token. Codex freezes it at
 *   login (refreshed tokens keep the claims), so it only describes the first
 *   billing cycle and is shown only while its end is still ahead.
 */
export type AuthFileSubscriptionSource = "live" | "manual" | "claims";

/** Billing state, known from a live read only. */
export type AuthFileSubscriptionState = "active" | "canceling" | "past_due" | "inactive";

export type AuthFileSubscriptionStatus = {
  source: AuthFileSubscriptionSource;
  /** Null when only the end is known (live reads, end-only token snapshots). */
  startedAtMs: number | null;
  startedAtText: string;
  /** Null only for a live read that reports no paid plan and gives no end. */
  expiresAtMs: number | null;
  expiresAtText: string;
  remainingDays: number;
  expired: boolean;
  period: AuthFileSubscriptionPeriod;
  tone: "active" | "warning" | "urgent" | "expired";
  /** Live reads only. */
  state?: AuthFileSubscriptionState;
  renewsAtMs?: number | null;
  cancelsAtMs?: number | null;
  checkedAtMs?: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENT_DAYS = 5;
const SUBSCRIPTION_STATES: readonly string[] = ["active", "canceling", "past_due", "inactive"];

export const normalizeAuthFileSubscriptionPeriod = (value: unknown): AuthFileSubscriptionPeriod => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "year" || normalized === "yearly" || normalized === "annual") {
    return "yearly";
  }
  return "monthly";
};

// A state a newer backend adds is read as active rather than dropped.
const normalizeSubscriptionState = (value: unknown): AuthFileSubscriptionState => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return SUBSCRIPTION_STATES.includes(normalized)
    ? (normalized as AuthFileSubscriptionState)
    : "active";
};

const formatMs = (ms: number | null): string => (ms === null ? "" : new Date(ms).toLocaleString());

const remainingDaysUntil = (expiresAtMs: number, nowMs: number): number => {
  const diffMs = expiresAtMs - nowMs;
  if (diffMs === 0) return 0;
  return diffMs > 0 ? Math.ceil(diffMs / DAY_MS) : -Math.ceil(Math.abs(diffMs) / DAY_MS);
};

const countdownStatus = (
  source: AuthFileSubscriptionSource,
  startedAtMs: number | null,
  expiresAtMs: number,
  period: AuthFileSubscriptionPeriod,
  nowMs: number,
): AuthFileSubscriptionStatus => {
  const remainingDays = remainingDaysUntil(expiresAtMs, nowMs);
  const expired = remainingDays <= 0;
  return {
    source,
    startedAtMs,
    startedAtText: formatMs(startedAtMs),
    expiresAtMs,
    expiresAtText: formatMs(expiresAtMs),
    remainingDays,
    expired,
    period,
    tone: expired ? "expired" : remainingDays <= URGENT_DAYS ? "urgent" : "active",
  };
};

const resolveManualStartMs = (file: AuthFileItem): number | null =>
  parseDateLikeMs(file.subscription_started_at_ms ?? file.subscriptionStartedAtMs) ??
  parseDateLikeMs(
    file.subscription_started_at ??
      file.subscriptionStartedAt ??
      file.subscription_start_at ??
      file.subscriptionStartAt,
  );

const addCalendarMonths = (startMs: number, months: number): number | null => {
  const date = new Date(startMs);
  if (Number.isNaN(date.getTime())) return null;

  const day = date.getDate();
  const result = new Date(startMs);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDayOfTargetMonth));

  return Number.isNaN(result.getTime()) ? null : result.getTime();
};

/**
 * The live read, when the status API reported one. A plan that renews on its own
 * stays calm until its end passes: the provider charges by itself, so a renewal
 * date coming up is nothing to act on. A plan whose renewal is off, or whose
 * renewal charge failed, is what needs attention.
 */
export const resolveLiveAuthFileSubscription = (
  file: AuthFileItem,
  nowMs = Date.now(),
): AuthFileSubscriptionStatus | null => {
  const shared = file.shared_subscription;
  if (!shared || shared.source !== "probe") return null;
  const state = normalizeSubscriptionState(shared.state);
  const live = {
    state,
    renewsAtMs: parseDateLikeMs(shared.renews_at),
    cancelsAtMs: parseDateLikeMs(shared.cancels_at),
    checkedAtMs: parseDateLikeMs(shared.checked_at),
  };
  const period = normalizeAuthFileSubscriptionPeriod(shared.period);
  const startedAtMs = parseDateLikeMs(shared.started_at);
  const expiresAtMs = parseDateLikeMs(shared.expires_at);
  if (expiresAtMs === null) {
    if (state !== "inactive") return null;
    return {
      source: "live",
      startedAtMs,
      startedAtText: formatMs(startedAtMs),
      expiresAtMs: null,
      expiresAtText: "",
      remainingDays: 0,
      expired: true,
      period,
      tone: "expired",
      ...live,
    };
  }
  const status = countdownStatus("live", startedAtMs, expiresAtMs, period, nowMs);
  let tone: AuthFileSubscriptionStatus["tone"] = "active";
  if (status.expired || state === "inactive") tone = "expired";
  else if (state === "past_due") tone = "urgent";
  else if (state === "canceling") tone = status.remainingDays <= URGENT_DAYS ? "urgent" : "warning";
  return { ...status, tone, ...live };
};

/**
 * Live read first, then the tenant's manual start time, then a token snapshot
 * still ahead of its end. A snapshot past its end is not shown as expired: the
 * claims are frozen at login, so it says nothing about whether the plan renewed
 * (before live reads every Codex card read "expired weeks ago" this way).
 */
export const resolveAuthFileSubscriptionStatus = (
  file: AuthFileItem,
  nowMs = Date.now(),
): AuthFileSubscriptionStatus | null => {
  const live = resolveLiveAuthFileSubscription(file, nowMs);
  if (live) return live;

  const period = normalizeAuthFileSubscriptionPeriod(
    file.subscription_period ?? file.subscriptionPeriod,
  );
  const manualStartMs = resolveManualStartMs(file);
  if (manualStartMs !== null) {
    const expiresAtMs = addCalendarMonths(manualStartMs, period === "yearly" ? 12 : 1);
    return expiresAtMs === null
      ? null
      : countdownStatus("manual", manualStartMs, expiresAtMs, period, nowMs);
  }

  const shared = file.shared_subscription;
  if (!shared || shared.source === "probe") return null;
  const expiresAtMs = parseDateLikeMs(shared.expires_at);
  if (expiresAtMs === null || expiresAtMs <= nowMs) return null;
  return countdownStatus("claims", parseDateLikeMs(shared.started_at), expiresAtMs, period, nowMs);
};

/** The subscription_* fields of one AI account status entry. */
export type AuthFileSubscriptionStatusFields = {
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  subscription_source?: string | null;
  subscription_renews_at?: string | null;
  subscription_cancels_at?: string | null;
  subscription_period?: string | null;
  subscription_state?: string | null;
  subscription_checked_at?: string | null;
};

const presentText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/**
 * The shared subscription one status entry carries, or null when it carries none.
 * Null means "keep what you had", not "clear it": an entry may leave the set out
 * on a partial refresh. A reported set replaces the stored one whole, so a
 * renewal date a newer read dropped does not linger.
 */
export const sharedSubscriptionFromStatus = (
  status: AuthFileSubscriptionStatusFields,
): AuthFileSharedSubscription | null => {
  const shared: AuthFileSharedSubscription = {
    started_at: presentText(status.subscription_started_at),
    expires_at: presentText(status.subscription_expires_at),
    source: presentText(status.subscription_source),
    renews_at: presentText(status.subscription_renews_at),
    cancels_at: presentText(status.subscription_cancels_at),
    period: presentText(status.subscription_period),
    state: presentText(status.subscription_state),
    checked_at: presentText(status.subscription_checked_at),
  };
  return Object.values(shared).some((value) => value !== null) ? shared : null;
};
