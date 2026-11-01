import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatCooldownRemaining, normalizeCooldownReason } from "@code-proxy/domain";
import { DetailBadge, type DetailBadgeTone } from "./detailBadge";
import {
  earliestCandidateRecovery,
  formatStepDuration,
  formatTraceClock,
  MEMBER_TURNS,
  msBetween,
  routeTraceAccountName,
  routeTraceMemberRoute,
  routeTraceVerdict,
  type RouteTrace,
  type RouteTraceCandidate,
  type RouteTraceStep,
  type RouteTraceVerdict,
} from "./routeTrace";

/**
 * 请求详情的「路由时间线」：先一句话说请求怎样了，再按时间列出调度器做的每一步。
 *
 * 原因码与路由模拟器、账号页共用一套文案：冷却原因读 `auth_files.cooldown_reason`，账号状态读
 * `channel_groups_page.simulator.block`，只有轨迹自己才有的原因和状态放在 `log_content.route_trace`。
 */

type TFunction = ReturnType<typeof useTranslation>["t"];

/** 轨迹自己才有的失败原因；其余是账号的冷却原因码。 */
const TRACE_CAUSES = new Set([
  "request_invalid",
  "content_policy",
  "first_token_timeout",
  "stream_incomplete",
  "network_error",
]);
const SIMULATOR_BLOCKS = new Set(["cooldown", "unavailable", "disabled", "weight"]);
const TRACE_STATES = new Set(["tried", "saturated"]);
const WAIT_KINDS = new Set(["request-retry", "busy-wait"]);
const OUTCOMES = new Set(["success", "failed", "canceled"]);
/** 虚拟模型成员步骤的原因：前三个是换到了它，后三个是跳过了它。 */
const MEMBER_REASONS = new Set([
  "first",
  "weighted",
  "fallback",
  "not_allowed",
  "disabled",
  "no_provider",
]);

function causeLabel(t: TFunction, cause: string): string {
  const reason = normalizeCooldownReason(cause);
  if (reason) return t(`auth_files.cooldown_reason.${reason}`);
  if (TRACE_CAUSES.has(cause)) return t(`log_content.route_trace.cause.${cause}`);
  return cause;
}

/** 「触发限流（429）」：原因和状态码都有就一起写，都没有时说原因未知。 */
function failureText(t: TFunction, step: Pick<RouteTraceStep, "cause" | "status">): string {
  const cause = causeLabel(t, step.cause);
  if (cause && step.status > 0) {
    return t("log_content.route_trace.failure_with_status", { cause, status: step.status });
  }
  if (cause) return cause;
  if (step.status > 0) return `HTTP ${step.status}`;
  return t("log_content.route_trace.cause_unknown");
}

function durationLabels(t: TFunction) {
  return {
    day: t("auth_files.restriction_duration_day"),
    hour: t("auth_files.restriction_duration_hour"),
    minute: t("auth_files.restriction_duration_minute"),
    second: t("auth_files.restriction_duration_second"),
  };
}

/** 一步结束的时刻：开始时刻加耗时。 */
function stepEndMs(step: RouteTraceStep): number {
  const at = Date.parse(step.at);
  return Number.isFinite(at) ? at + step.durationMs : Number.NaN;
}

/** 失败把账号留在了什么状态，作为一句话；没有留下状态时为空。 */
function accountStateSentence(
  t: TFunction,
  language: string | undefined,
  step: RouteTraceStep,
): string {
  if (!step.blocked || step.blocked === "weight") return "";
  const account = routeTraceAccountName(step);
  if (step.blocked === "disabled") {
    return t("log_content.route_trace.account_state.model_disabled", { account });
  }
  const untilMs = Date.parse(step.blockedUntil);
  if (!Number.isFinite(untilMs)) {
    return t("log_content.route_trace.account_state.paused_no_end", { account });
  }
  const fromMs = stepEndMs(step);
  return t("log_content.route_trace.account_state.paused_until", {
    account,
    time: formatTraceClock(step.blockedUntil, step.at, language),
    remaining: formatCooldownRemaining(
      untilMs,
      Number.isFinite(fromMs) ? fromMs : untilMs,
      durationLabels(t),
    ),
  });
}

/** 时间线那一行里的账号状态：账号名已经在行首，这里只说暂停到何时。 */
function blockedLine(t: TFunction, language: string | undefined, step: RouteTraceStep): string {
  if (!step.blocked || step.blocked === "weight") return "";
  if (step.blocked === "disabled") return t("channel_groups_page.simulator.block.disabled");
  const untilMs = Date.parse(step.blockedUntil);
  if (!Number.isFinite(untilMs)) return t("log_content.route_trace.blocked_no_end");
  const fromMs = stepEndMs(step);
  return t("log_content.route_trace.blocked_until", {
    time: formatTraceClock(step.blockedUntil, step.at, language),
    remaining: formatCooldownRemaining(
      untilMs,
      Number.isFinite(fromMs) ? fromMs : untilMs,
      durationLabels(t),
    ),
  });
}

function leadSentence(t: TFunction, lead: NonNullable<RouteTraceVerdict["lead"]>): string {
  switch (lead.kind) {
    case "served":
      return lead.failedBefore > 0
        ? t("log_content.route_trace.lead.served_after", {
            account: routeTraceAccountName(lead.attempt),
            attempt: lead.attempt.attempt,
            count: lead.failedBefore,
          })
        : t("log_content.route_trace.lead.served_first", {
            account: routeTraceAccountName(lead.attempt),
          });
    case "failed":
      return t("log_content.route_trace.lead.failed", {
        attempt: lead.attempt.attempt,
        account: routeTraceAccountName(lead.attempt),
        failure: failureText(t, lead.attempt),
      });
    case "client_left":
      if (lead.step.kind === "queue") return t("log_content.route_trace.lead.client_left_queue");
      if (lead.step.kind === "wait") return t("log_content.route_trace.lead.client_left_wait");
      return t("log_content.route_trace.lead.client_left_attempt", {
        attempt: lead.step.attempt,
        account: routeTraceAccountName(lead.step),
      });
    case "running":
      return t("log_content.route_trace.lead.running", {
        attempt: lead.attempt.attempt,
        account: routeTraceAccountName(lead.attempt),
      });
    case "queue_gave_up":
      return t("log_content.route_trace.lead.queue_gave_up", {
        duration: formatStepDuration(lead.queue.durationMs),
      });
    case "no_account":
      return t("log_content.route_trace.lead.no_account");
    case "no_member":
      return t("log_content.route_trace.lead.no_member", { name: lead.step.virtualModel });
  }
}

/** 「第 2 个成员（共 3 个）」这类句子的参数。 */
const memberParams = (step: RouteTraceStep) => ({
  member: step.member,
  members: step.members,
  name: step.virtualModel,
  route: routeTraceMemberRoute(step),
});

/** 没有账号能接时补的两句：最早什么时候有账号恢复，客户端被告知多久后重试。 */
function exhaustedSentences(
  t: TFunction,
  language: string | undefined,
  step: RouteTraceStep,
): string[] {
  const out: string[] = [];
  const earliest = earliestCandidateRecovery(step);
  if (earliest) {
    out.push(
      t("log_content.route_trace.exhausted_detail.earliest", {
        time: formatTraceClock(earliest, step.at, language),
      }),
    );
  }
  if (step.retryAfterMs > 0) {
    out.push(
      t("log_content.route_trace.exhausted_detail.retry_after", {
        duration: formatCooldownRemaining(step.retryAfterMs, 0, durationLabels(t)),
      }),
    );
  }
  return out;
}

function nextSentence(t: TFunction, next: NonNullable<RouteTraceVerdict["next"]>): string {
  switch (next.kind) {
    case "moved_on":
      return t("log_content.route_trace.next.moved_on", {
        account: routeTraceAccountName(next.attempt),
      });
    case "queued":
      return t("log_content.route_trace.next.queued");
    case "waiting": {
      const duration = formatCooldownRemaining(
        next.wait.durationMs || next.wait.plannedMs,
        0,
        durationLabels(t),
      );
      if (next.wait.waitKind === "busy-wait") {
        return t("log_content.route_trace.next.waiting_busy", { duration });
      }
      if (next.wait.waitKind === "request-retry") {
        return t("log_content.route_trace.next.waiting_retry", { duration });
      }
      return t("log_content.route_trace.next.waiting", { duration });
    }
    case "exhausted":
      return t("log_content.route_trace.next.exhausted");
    case "member":
      return t("log_content.route_trace.next.member", memberParams(next.member));
    case "not_retried":
      return next.why === "pinned"
        ? t("log_content.route_trace.next.not_retried_pinned")
        : t("log_content.route_trace.next.not_retried_request");
  }
}

/**
 * 结论：一到四句话，按「结果 → 账号留下的状态 → 接下来 → 没号可用时的补充」排列。中文句末是全角
 * 标点，句与句直接相接；其它语言用空格隔开。轨迹说明不了什么时为空串。
 */
export function routeTraceSummary(
  t: TFunction,
  language: string | undefined,
  trace: RouteTrace,
): string {
  const { lead, next } = routeTraceVerdict(trace);
  const sentences: string[] = [];
  if (lead) {
    sentences.push(leadSentence(t, lead));
    if (lead.kind === "served" && lead.member) {
      sentences.push(t("log_content.route_trace.served_by_member", memberParams(lead.member)));
    }
    if (lead.kind === "failed") {
      const state = accountStateSentence(t, language, lead.attempt);
      if (state) sentences.push(state);
    }
  }
  if (next?.kind === "member" && next.exhausted) {
    sentences.push(t("log_content.route_trace.next.exhausted"));
  }
  if (next) sentences.push(nextSentence(t, next));
  // 换到下一个成员时请求没有等，也没让客户端重试：恢复时刻和重试时间都不说。
  const exhausted =
    next?.kind === "exhausted"
      ? next.exhausted
      : lead?.kind === "no_account" && next?.kind !== "member"
        ? lead.exhausted
        : null;
  if (exhausted) sentences.push(...exhaustedSentences(t, language, exhausted));
  return sentences.join(language?.startsWith("zh") ? "" : " ");
}

function outcomeTone(step: RouteTraceStep): DetailBadgeTone {
  if (step.outcome === "success") return "success";
  if (step.outcome === "failed") return "danger";
  if (step.outcome === "canceled") return "neutral";
  return "info";
}

function outcomeLabel(t: TFunction, step: RouteTraceStep): string {
  if (!step.outcome) return t("log_content.route_trace.outcome.running");
  return OUTCOMES.has(step.outcome)
    ? t(`log_content.route_trace.outcome.${step.outcome}`)
    : step.outcome;
}

// 时间线上的圆点：实色在深浅两种底色上都看得清，不需要 dark: 变体。
const DOT_TONE: Record<DetailBadgeTone, string> = {
  neutral: "bg-ink-4",
  info: "bg-sky-500",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  danger: "bg-rose-500",
};

function stepTone(step: RouteTraceStep): DetailBadgeTone {
  switch (step.kind) {
    case "attempt":
      return outcomeTone(step);
    case "skip":
    case "wait":
      return "warning";
    case "queue":
      return step.outcome === "failed" ? "danger" : "warning";
    case "exhausted":
      return "danger";
    case "member":
      return MEMBER_TURNS.has(step.reason) ? "info" : "warning";
    default:
      return "neutral";
  }
}

function candidateStateLabel(t: TFunction, candidate: RouteTraceCandidate): string {
  if (!candidate.state) return t("log_content.route_trace.state.available");
  if (TRACE_STATES.has(candidate.state)) {
    return t(`log_content.route_trace.state.${candidate.state}`);
  }
  if (SIMULATOR_BLOCKS.has(candidate.state)) {
    return t(`channel_groups_page.simulator.block.${candidate.state}`);
  }
  return candidate.state;
}

function AccountName({
  step,
}: {
  step: Pick<RouteTraceStep, "authLabel" | "authId" | "provider">;
}) {
  const name = routeTraceAccountName(step);
  if (!name) return null;
  return (
    <span
      className="min-w-0 break-all"
      title={step.authId && step.authId !== name ? step.authId : undefined}
    >
      <span className="font-medium text-ink">{name}</span>
      {step.provider ? <span className="text-ink-3"> · {step.provider}</span> : null}
    </span>
  );
}

function StepLines({ lines }: { lines: ReactNode[] }) {
  const shown = lines.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs leading-5 text-ink-2">
      {shown.map((line, index) => (
        <div key={index} className="min-w-0 break-words">
          {line}
        </div>
      ))}
    </div>
  );
}

function ErrorText({ value }: { value: string }) {
  return <span className="font-mono text-ink-3 [overflow-wrap:anywhere]">{value}</span>;
}

function AttemptStep({ step, language }: { step: RouteTraceStep; language: string | undefined }) {
  const { t } = useTranslation();
  const lines: ReactNode[] = [];
  if (step.outcome === "failed") {
    lines.push(failureText(t, step), blockedLine(t, language, step));
    if (step.beforeFirstByte) lines.push(t("log_content.route_trace.before_first_byte"));
  }
  if (step.firstTokenMs > 0) {
    lines.push(
      t("log_content.route_trace.first_token", { duration: formatStepDuration(step.firstTokenMs) }),
    );
  }
  if (step.optimistic) {
    lines.push(
      t("log_content.route_trace.optimistic", {
        time: step.coolingUntil ? formatTraceClock(step.coolingUntil, step.at, language) : "—",
      }),
    );
  }
  const meta = [
    step.model ? t("log_content.route_trace.model", { model: step.model }) : "",
    step.group ? t("log_content.route_trace.group", { group: step.group }) : "",
  ].filter(Boolean);
  if (meta.length > 0) lines.push(<span className="text-ink-3">{meta.join(" · ")}</span>);
  if ((step.outcome === "failed" || step.outcome === "canceled") && step.error) {
    lines.push(<ErrorText value={step.error} />);
  }
  return (
    <>
      <StepHeading
        title={t("log_content.route_trace.step.attempt", { attempt: step.attempt })}
        badge={<DetailBadge tone={outcomeTone(step)}>{outcomeLabel(t, step)}</DetailBadge>}
        durationMs={step.durationMs}
      >
        <AccountName step={step} />
      </StepHeading>
      <StepLines lines={lines} />
    </>
  );
}

function StepHeading({
  title,
  badge,
  durationMs,
  children,
}: {
  title: string;
  badge?: ReactNode;
  durationMs?: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className="text-ink-2">{title}</span>
      {children}
      {badge}
      {durationMs && durationMs > 0 ? (
        <span className="text-xs tabular-nums text-ink-3">{formatStepDuration(durationMs)}</span>
      ) : null}
    </div>
  );
}

function CandidateList({ step, language }: { step: RouteTraceStep; language: string | undefined }) {
  const { t } = useTranslation();
  if (step.candidates.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="pb-1 text-xs font-medium text-ink-3">
        {t("log_content.route_trace.candidates_title")}
      </div>
      <ul className="divide-y divide-line">
        {step.candidates.map((candidate) => (
          <li
            key={candidate.authId}
            className="grid min-w-0 gap-x-3 gap-y-0.5 py-1.5 text-xs sm:grid-cols-[minmax(8rem,13rem)_minmax(0,1fr)]"
          >
            <AccountName
              step={{
                authLabel: candidate.label,
                authId: candidate.authId,
                provider: candidate.provider,
              }}
            />
            <span className="min-w-0 break-words text-ink-2">
              {[
                candidateStateLabel(t, candidate),
                candidate.until
                  ? t("log_content.route_trace.until", {
                      time: formatTraceClock(candidate.until, step.at, language),
                    })
                  : "",
                candidate.cause || candidate.status > 0 ? failureText(t, candidate) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </li>
        ))}
      </ul>
      {step.candidatesOmitted > 0 ? (
        <div className="pt-1 text-xs text-ink-3">
          {t("log_content.route_trace.candidates_omitted", { count: step.candidatesOmitted })}
        </div>
      ) : null}
    </div>
  );
}

/** 虚拟模型的一个成员：请求换到了它，或者跳过了它。 */
function MemberStep({ step }: { step: RouteTraceStep }) {
  const { t } = useTranslation();
  const turned = MEMBER_TURNS.has(step.reason);
  const lines: ReactNode[] = [];
  if (step.reason === "fallback" && (step.cause || step.status > 0)) {
    lines.push(
      t("log_content.route_trace.member_detail.fallback", { failure: failureText(t, step) }),
    );
  } else if (!turned && MEMBER_REASONS.has(step.reason)) {
    lines.push(t(`log_content.route_trace.member_detail.${step.reason}`));
  }
  // 换到成员时的错误是上一个成员的，那一行已经写过；跳过时的原文说的是哪里拒绝了它。
  if (!turned && step.error) lines.push(<ErrorText value={step.error} />);
  return (
    <>
      <StepHeading
        title={t("log_content.route_trace.step.member", {
          member: step.member,
          members: step.members,
        })}
        badge={
          step.reason ? (
            <DetailBadge tone={turned ? "info" : "warning"}>
              {MEMBER_REASONS.has(step.reason)
                ? t(`log_content.route_trace.member_reason.${step.reason}`)
                : step.reason}
            </DetailBadge>
          ) : null
        }
      >
        <span className="min-w-0 font-mono text-xs text-ink [overflow-wrap:anywhere]">
          {routeTraceMemberRoute(step)}
        </span>
      </StepHeading>
      <StepLines lines={lines} />
    </>
  );
}

function StepBody({ step, language }: { step: RouteTraceStep; language: string | undefined }) {
  const { t } = useTranslation();
  switch (step.kind) {
    case "attempt":
      return <AttemptStep step={step} language={language} />;
    case "skip":
      return (
        <StepHeading title={t("log_content.route_trace.step.skip")}>
          <AccountName step={step} />
          <span className="text-xs text-ink-3">
            {step.reason === "saturated"
              ? t("log_content.route_trace.skip_reason.saturated")
              : step.reason}
          </span>
        </StepHeading>
      );
    case "queue": {
      const lines: ReactNode[] = [
        step.accounts > 0
          ? t("log_content.route_trace.queue_accounts", { count: step.accounts })
          : "",
      ];
      if (step.outcome === "success" && step.authId) {
        lines.push(
          t("log_content.route_trace.queue_granted", { account: routeTraceAccountName(step) }),
        );
      }
      if (step.outcome === "failed" && step.error) lines.push(<ErrorText value={step.error} />);
      return (
        <>
          <StepHeading
            title={t("log_content.route_trace.step.queue")}
            badge={
              step.outcome === "success" ? null : (
                <DetailBadge tone={outcomeTone(step)}>
                  {step.outcome === "failed"
                    ? t("log_content.route_trace.queue_gave_up")
                    : outcomeLabel(t, step)}
                </DetailBadge>
              )
            }
            durationMs={step.durationMs}
          />
          <StepLines lines={lines} />
        </>
      );
    }
    case "wait": {
      const kind = WAIT_KINDS.has(step.waitKind)
        ? t(`log_content.route_trace.wait_kind.${step.waitKind}`)
        : step.waitKind;
      return (
        <>
          <StepHeading
            title={t("log_content.route_trace.step.wait")}
            badge={
              step.outcome && step.outcome !== "success" ? (
                <DetailBadge tone={outcomeTone(step)}>{outcomeLabel(t, step)}</DetailBadge>
              ) : !step.outcome ? (
                <DetailBadge tone="info">{outcomeLabel(t, step)}</DetailBadge>
              ) : null
            }
            durationMs={step.durationMs}
          >
            {kind ? <span className="text-xs text-ink-3">{kind}</span> : null}
          </StepHeading>
          <StepLines
            lines={[
              step.plannedMs > 0
                ? t("log_content.route_trace.wait_planned", {
                    duration: formatStepDuration(step.plannedMs),
                  })
                : "",
              step.outcome === "failed" && step.error ? <ErrorText value={step.error} /> : "",
            ]}
          />
        </>
      );
    }
    case "exhausted":
      return (
        <>
          <StepHeading
            title={t("log_content.route_trace.step.exhausted")}
            badge={
              step.errorCode || step.status > 0 ? (
                <DetailBadge tone="danger">
                  {[step.status > 0 ? String(step.status) : "", step.errorCode]
                    .filter(Boolean)
                    .join(" · ")}
                </DetailBadge>
              ) : null
            }
          />
          <StepLines
            lines={[
              step.error ? <ErrorText value={step.error} /> : "",
              step.retryAfterMs > 0
                ? t("log_content.route_trace.retry_after", {
                    duration: formatStepDuration(step.retryAfterMs),
                  })
                : "",
            ]}
          />
          <CandidateList step={step} language={language} />
        </>
      );
    case "member":
      return <MemberStep step={step} />;
    default:
      return <StepHeading title={step.kind} />;
  }
}

/** 时间线左列：第一步写时刻，之后写相对第一步过了多久，悬停看完整时刻。 */
function StepTime({
  step,
  first,
  language,
}: {
  step: RouteTraceStep;
  first: RouteTraceStep;
  language: string | undefined;
}) {
  const offset = step === first ? null : msBetween(first.at, step.at);
  const clock = formatTraceClock(step.at, first.at, language);
  return (
    <span className="pt-0.5 font-mono text-xs tabular-nums text-ink-3" title={clock}>
      {offset === null ? clock : `+${formatStepDuration(Math.max(0, offset))}`}
    </span>
  );
}

export function RouteTimelineBadges({ trace }: { trace: RouteTrace }) {
  const { t } = useTranslation();
  const attempts = trace.steps.reduce(
    (max, step) => (step.kind === "attempt" ? Math.max(max, step.attempt || 1) : max),
    0,
  );
  const badges: ReactNode[] = [];
  const virtualModel = trace.steps.find(
    (step) => step.kind === "member" && step.virtualModel,
  )?.virtualModel;
  if (virtualModel) {
    badges.push(
      <DetailBadge key="virtual-model" tone="info">
        {t("log_content.route_trace.badge_virtual_model", { name: virtualModel })}
      </DetailBadge>,
    );
  }
  if (attempts > 0) {
    badges.push(
      <DetailBadge key="attempts" tone="neutral">
        {t("log_content.route_trace.badge_attempts", { count: attempts })}
      </DetailBadge>,
    );
  }
  if (trace.pinned) {
    badges.push(
      <DetailBadge key="pinned" tone="info">
        {t("log_content.route_trace.badge_pinned")}
      </DetailBadge>,
    );
  }
  return <>{badges}</>;
}

// 时刻 · 圆点 · 内容三列：省略标记也用同一套列，对得齐。
const STEP_ROW =
  "grid min-w-0 grid-cols-[4.5rem_0.5rem_minmax(0,1fr)] items-start gap-x-2.5 py-2.5";

export function RouteTimeline({ trace }: { trace: RouteTrace }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const summary = routeTraceSummary(t, language, trace);
  const first = trace.steps[0];
  return (
    <div className="space-y-3 pt-1">
      {summary ? (
        <p data-testid="route-trace-summary" className="text-sm leading-6 text-ink">
          {summary}
        </p>
      ) : null}
      <ol className="divide-y divide-line" aria-label={t("log_content.route_trace.title")}>
        {trace.steps.map((step, index) => (
          <Fragment key={`${step.kind}-${step.at}-${index}`}>
            {trace.omitted > 0 && index === trace.omittedAfter ? (
              <li className={STEP_ROW}>
                <span className="font-mono text-xs text-ink-3" aria-hidden="true">
                  ⋯
                </span>
                <span />
                <span className="text-xs text-ink-3">
                  {t("log_content.route_trace.omitted", { count: trace.omitted })}
                </span>
              </li>
            ) : null}
            <li className={STEP_ROW}>
              <StepTime step={step} first={first} language={language} />
              <span
                className={`mt-1.5 size-2 rounded-full ${DOT_TONE[stepTone(step)]}`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <StepBody step={step} language={language} />
              </div>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}
