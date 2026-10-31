/**
 * 路由轨迹：调度器为一个请求做过的每一步（CliRelay `sdk/cliproxy/routetrace`），写在请求详情的
 * `diagnostic.route_trace` 里——每次上游尝试和它的结果、因并发已满被跳过的账号、排队与等待、
 * 没有账号能接时每个候选为什么接不了。旧后端没有这个字段，时间线就不出现。
 *
 * 一条请求日志对应一次上游尝试，轨迹记的却是整个请求：失败的那条记录要等调度器做出下一个决定
 * 才写出，所以它的轨迹比那次尝试多出一截「接下来做了什么」——换到下一个账号、排队、等待或放弃。
 *
 * 后端只新增步骤种类、结果和原因码，不改名；不认识的值原样保留，界面按原文显示。
 */

export interface RouteTraceCandidate {
  authId: string;
  label: string;
  provider: string;
  /**
   * tried（这个请求已经试过）、saturated（并发已满），或路由模拟器的
   * cooldown / unavailable / disabled / weight；空表示它本可以接，这一轮是因为别的原因结束的。
   */
  state: string;
  until: string;
  cause: string;
  status: number;
}

export interface RouteTraceStep {
  /** attempt / skip / queue / wait / exhausted。 */
  kind: string;
  at: string;
  /** 这一步用了多久；还在进行时为 0。 */
  durationMs: number;
  /** 第几次上游尝试，从 1 开始。 */
  attempt: number;
  group: string;
  authId: string;
  authLabel: string;
  provider: string;
  /** 发往上游的模型名（已按账号的别名改写）。 */
  model: string;
  /** 全部账号都只短暂暂停时，调度器会先试恢复最早的那个，这时它还在冷却，直到 coolingUntil。 */
  optimistic: boolean;
  coolingUntil: string;
  /** success / failed / canceled；还在进行时为空。 */
  outcome: string;
  status: number;
  cause: string;
  error: string;
  /** 失败让账号进入的状态（模拟器的 cooldown 等）及到期时间；没有到期时间表示要等探测或人工处理。 */
  blocked: string;
  blockedUntil: string;
  firstTokenMs: number;
  /** 流在给客户端发出任何内容前就失败了：处理器还可能换个账号重试。 */
  beforeFirstByte: boolean;
  /** 跳过的原因。 */
  reason: string;
  /** 排队时在等的账号数。 */
  accounts: number;
  /** request-retry / busy-wait，以及调度器打算等多久。 */
  waitKind: string;
  plannedMs: number;
  errorCode: string;
  retryAfterMs: number;
  candidates: RouteTraceCandidate[];
  candidatesOmitted: number;
}

export interface RouteTrace {
  /** 请求绑定在一个账号上（固定凭据或会话粘性）：失败不会换号。 */
  pinned: boolean;
  steps: RouteTraceStep[];
  /** steps[omittedAfter - 1] 与 steps[omittedAfter] 之间省略了 omitted 步（后端只留头 8 步、尾 24 步）。 */
  omitted: number;
  omittedAfter: number;
}

type TraceRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TraceRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const count = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function normalizeCandidate(raw: unknown): RouteTraceCandidate | null {
  if (!isRecord(raw)) return null;
  const authId = text(raw.auth_id);
  if (!authId) return null;
  return {
    authId,
    label: text(raw.label),
    provider: text(raw.provider),
    state: text(raw.state),
    until: text(raw.until),
    cause: text(raw.cause),
    status: count(raw.status),
  };
}

function normalizeStep(raw: unknown): RouteTraceStep | null {
  if (!isRecord(raw)) return null;
  const kind = text(raw.kind);
  if (!kind) return null;
  return {
    kind,
    at: text(raw.at),
    durationMs: count(raw.duration_ms),
    attempt: count(raw.attempt),
    group: text(raw.group),
    authId: text(raw.auth_id),
    authLabel: text(raw.auth_label),
    provider: text(raw.provider),
    model: text(raw.model),
    optimistic: raw.optimistic === true,
    coolingUntil: text(raw.cooling_until),
    outcome: text(raw.outcome),
    status: count(raw.status),
    cause: text(raw.cause),
    error: text(raw.error),
    blocked: text(raw.blocked),
    blockedUntil: text(raw.blocked_until),
    firstTokenMs: count(raw.first_token_ms),
    beforeFirstByte: raw.before_first_byte === true,
    reason: text(raw.reason),
    accounts: count(raw.accounts),
    waitKind: text(raw.wait_kind),
    plannedMs: count(raw.planned_ms),
    errorCode: text(raw.error_code),
    retryAfterMs: count(raw.retry_after_ms),
    candidates: Array.isArray(raw.candidates)
      ? raw.candidates
          .map(normalizeCandidate)
          .filter((item): item is RouteTraceCandidate => item !== null)
      : [],
    candidatesOmitted: count(raw.candidates_omitted),
  };
}

/** 一段路由轨迹；不是轨迹、或一步也没有时为 null。 */
export function normalizeRouteTrace(raw: unknown): RouteTrace | null {
  if (!isRecord(raw) || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps
    .map(normalizeStep)
    .filter((step): step is RouteTraceStep => step !== null);
  if (steps.length === 0) return null;
  const omitted = count(raw.omitted);
  const omittedAfter = count(raw.omitted_after);
  // 省略标记要落在两步之间，否则不显示：宁可漏掉一行「省略了几步」，也不画在错的位置。
  const marked = omitted > 0 && omittedAfter > 0 && omittedAfter < steps.length;
  return {
    pinned: raw.pinned === true,
    steps,
    omitted: marked ? omitted : 0,
    omittedAfter: marked ? omittedAfter : 0,
  };
}

/** 请求详情（detail_content）里的路由轨迹。 */
export function readRouteTrace(details: unknown): RouteTrace | null {
  if (!isRecord(details) || !isRecord(details.diagnostic)) return null;
  return normalizeRouteTrace(details.diagnostic.route_trace);
}

/** 账号在界面上的名字：渠道名，没有就用账号 ID。 */
export const routeTraceAccountName = (step: Pick<RouteTraceStep, "authLabel" | "authId">) =>
  step.authLabel || step.authId;

/** 上游拒绝的是请求本身，换个账号也一样：调度器不会换号重试。 */
export const REQUEST_FAULT_CAUSES: ReadonlySet<string> = new Set([
  "request_invalid",
  "content_policy",
]);

/** 时间线开头的一句话：请求最后怎样了，或者它最近一次尝试怎样了。 */
export type RouteTraceLead =
  | { kind: "served"; attempt: RouteTraceStep; failedBefore: number }
  | { kind: "failed"; attempt: RouteTraceStep }
  | { kind: "client_left"; step: RouteTraceStep }
  | { kind: "running"; attempt: RouteTraceStep }
  | { kind: "queue_gave_up"; queue: RouteTraceStep }
  | { kind: "no_account"; exhausted: RouteTraceStep };

/** 失败之后请求做了什么；lead 已经说完整时为 null。 */
export type RouteTraceNext =
  | { kind: "moved_on"; attempt: RouteTraceStep }
  | { kind: "queued"; queue: RouteTraceStep }
  | { kind: "waiting"; wait: RouteTraceStep }
  | { kind: "exhausted"; exhausted: RouteTraceStep }
  | { kind: "not_retried"; why: "pinned" | "request" };

export interface RouteTraceVerdict {
  /** 轨迹的结尾说明不了什么时（比如只剩一次跳过）为 null，界面只显示时间线。 */
  lead: RouteTraceLead | null;
  next: RouteTraceNext | null;
}

/**
 * 从轨迹的结尾倒推出一句结论。
 *
 * 每条记录写出的时刻不同：成功的那条在尝试结束时写出，轨迹就停在这次尝试；失败的那条要等调度器
 * 的下一个决定，所以轨迹结尾是还在进行的下一次尝试、排队或等待，或者「没有账号能接」那一步。
 * 结论因此先说最近一次结束了的尝试，再说请求接下来去了哪里。
 */
export function routeTraceVerdict(trace: RouteTrace): RouteTraceVerdict {
  const { steps } = trace;
  const last = steps[steps.length - 1];
  const lastIndex = steps.length - 1;

  // last 之前最近的一次尝试；它还没结束（理论上不会出现）时不拿来下结论。
  const failedAttemptBefore = (end: number): RouteTraceStep | null => {
    for (let i = end - 1; i >= 0; i -= 1) {
      const step = steps[i];
      if (step.kind !== "attempt") continue;
      return step.outcome === "failed" ? step : null;
    }
    return null;
  };
  const exhaustedBefore = (end: number): RouteTraceStep | null => {
    for (let i = end - 1; i >= 0; i -= 1) {
      if (steps[i].kind === "exhausted") return steps[i];
      if (steps[i].kind === "attempt") return null;
    }
    return null;
  };
  const withFailure = (next: RouteTraceNext): RouteTraceVerdict => {
    const failed = failedAttemptBefore(lastIndex);
    if (failed) return { lead: { kind: "failed", attempt: failed }, next };
    const exhausted = exhaustedBefore(lastIndex);
    return { lead: exhausted ? { kind: "no_account", exhausted } : null, next };
  };

  if (!last) return { lead: null, next: null };
  switch (last.kind) {
    case "attempt": {
      if (last.outcome === "success") {
        const failedBefore =
          last.attempt > 0
            ? last.attempt - 1
            : steps.filter((step) => step.kind === "attempt" && step !== last).length;
        return { lead: { kind: "served", attempt: last, failedBefore }, next: null };
      }
      if (last.outcome === "failed") {
        const next: RouteTraceNext | null = trace.pinned
          ? { kind: "not_retried", why: "pinned" }
          : REQUEST_FAULT_CAUSES.has(last.cause)
            ? { kind: "not_retried", why: "request" }
            : null;
        return { lead: { kind: "failed", attempt: last }, next };
      }
      if (last.outcome === "canceled") {
        return { lead: { kind: "client_left", step: last }, next: null };
      }
      const failed = failedAttemptBefore(lastIndex);
      return failed
        ? { lead: { kind: "failed", attempt: failed }, next: { kind: "moved_on", attempt: last } }
        : { lead: { kind: "running", attempt: last }, next: null };
    }
    case "exhausted": {
      const failed = failedAttemptBefore(lastIndex);
      return failed
        ? {
            lead: { kind: "failed", attempt: failed },
            next: { kind: "exhausted", exhausted: last },
          }
        : { lead: { kind: "no_account", exhausted: last }, next: null };
    }
    case "queue": {
      if (last.outcome === "canceled")
        return { lead: { kind: "client_left", step: last }, next: null };
      if (last.outcome === "failed")
        return { lead: { kind: "queue_gave_up", queue: last }, next: null };
      return withFailure({ kind: "queued", queue: last });
    }
    case "wait": {
      if (last.outcome === "canceled")
        return { lead: { kind: "client_left", step: last }, next: null };
      return withFailure({ kind: "waiting", wait: last });
    }
    default: {
      const failed = failedAttemptBefore(lastIndex);
      return { lead: failed ? { kind: "failed", attempt: failed } : null, next: null };
    }
  }
}

/** 没有账号能接时，候选里最早恢复的时刻（RFC 3339）；都没有恢复时间时为空。 */
export function earliestCandidateRecovery(step: RouteTraceStep): string {
  let best = "";
  let bestMs = Number.POSITIVE_INFINITY;
  for (const candidate of step.candidates) {
    const ms = Date.parse(candidate.until);
    if (Number.isFinite(ms) && ms < bestMs) {
      best = candidate.until;
      bestMs = ms;
    }
  }
  return best;
}

/** 两个 RFC 3339 时刻之间的毫秒数；解析不了时为 null。 */
export function msBetween(from: string, to: string): number | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  return Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
}

/**
 * 步骤耗时：<1ms · 850ms · 1.25s · 12.3s · 2m 05s。每一档先按要显示的精度取整再判断落在哪档，
 * 否则 999.6ms 会写成「1000ms」、59.96s 会写成「60.0s」。
 */
export function formatStepDuration(ms: number): string {
  const value = Math.max(0, Number.isFinite(ms) ? ms : 0);
  if (value > 0 && value < 1) return "<1ms";
  if (Math.round(value) < 1_000) return `${Math.round(value)}ms`;
  const seconds = value / 1_000;
  if (Math.round(seconds * 100) < 1_000) return `${seconds.toFixed(2)}s`;
  if (Math.round(seconds * 10) < 600) return `${seconds.toFixed(1)}s`;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

/**
 * 时刻按界面语言显示到秒；和 reference 不是同一天时带上日期（冷却到明天、额度下周才重置）。
 * 解析不了时原样返回。
 */
export function formatTraceClock(iso: string, reference: string, language?: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return iso;
  const date = new Date(at);
  const ref = Date.parse(reference);
  const sameDay = Number.isFinite(ref) && new Date(ref).toDateString() === date.toDateString();
  try {
    return new Intl.DateTimeFormat(language || undefined, {
      ...(sameDay ? {} : { month: "2-digit", day: "2-digit" }),
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
