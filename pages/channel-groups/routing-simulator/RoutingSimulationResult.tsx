import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Minus, X } from "lucide-react";
import type {
  RoutingSimulationCredential,
  RoutingSimulationError,
  RoutingSimulationGroup,
  RoutingSimulationResult as SimulationResult,
  RoutingSimulationStage,
} from "@code-proxy/api-client/endpoints/routing-simulation";
import { normalizeCooldownReason } from "@code-proxy/domain";
import { Callout, ProviderTag, surface } from "@code-proxy/ui";
import { distributionLabel } from "@features/routing-config-editor";
import type { RoutingDistribution } from "@code-proxy/api-client/endpoints/routing-config";
import {
  credentialName,
  durationParts,
  formatList,
  msUntil,
  percent,
  simulationOutcome,
  splitCredentials,
} from "./simulationView";

type T = ReturnType<typeof useTranslation>["t"];

const KNOWN_STAGES = new Set([
  "auth",
  "route",
  "channel-group",
  "quota",
  "model-policy",
  "model-gate",
  "ccswitch-mapping",
  "system-prompt",
  "handler",
]);

const KNOWN_EXCLUSIONS = new Set([
  "disabled",
  "tenant",
  "pinned",
  "channel",
  "allowed-groups",
  "route-group",
  "tried",
  "model",
]);

const KNOWN_DISTRIBUTIONS = new Set(["weighted", "least-load", "fill-first", "reset-aware"]);

const formatDuration = (t: T, ms: number) => {
  const { unit, count } = durationParts(ms);
  return t(`channel_groups_page.simulator.duration.${unit}`, { count });
};

/** 后端新增的阶段名先原样显示，不猜意思。 */
const stageLabel = (t: T, name: string) =>
  KNOWN_STAGES.has(name) ? t(`channel_groups_page.simulator.stage.${name}`) : name;

function errorLine(t: T, error: RoutingSimulationError | undefined): ReactNode {
  if (!error) return null;
  const parts = [
    error["http-status"] ? `HTTP ${error["http-status"]}` : "",
    error.code ?? "",
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs leading-5 text-ink-2">
      {parts.length > 0 ? (
        <code className="font-mono text-xs text-ink">{parts.join(" · ")}</code>
      ) : null}
      {error.message ? <span className="min-w-0 break-words">{error.message}</span> : null}
      {error["retry-after-ms"] ? (
        <span className="text-ink-3">
          {t("channel_groups_page.simulator.retry_after", {
            time: formatDuration(t, error["retry-after-ms"]),
          })}
        </span>
      ) : null}
    </span>
  );
}

function StageStrip({ stages }: { stages: RoutingSimulationStage[] }) {
  const { t } = useTranslation();
  return (
    <ol
      className="flex flex-wrap gap-1.5"
      aria-label={t("channel_groups_page.simulator.stages_title")}
    >
      {stages.map((stage) => {
        const tone =
          stage.outcome === "passed"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : stage.outcome === "rejected"
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : "bg-subtle text-ink-3";
        const Icon = stage.outcome === "passed" ? Check : stage.outcome === "rejected" ? X : Minus;
        const outcome = ["passed", "rejected", "skipped", "not-run"].includes(stage.outcome)
          ? t(`channel_groups_page.simulator.stage_outcome.${stage.outcome}`)
          : stage.outcome;
        return (
          <li
            key={stage.name}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${tone}`}
            title={outcome}
          >
            <Icon size={12} aria-hidden="true" />
            <span>{stageLabel(t, stage.name)}</span>
            <span className="sr-only">{outcome}</span>
          </li>
        );
      })}
    </ol>
  );
}

function CredentialState({
  credential,
  nowMs,
}: {
  credential: RoutingSimulationCredential;
  nowMs: number;
}) {
  const { t } = useTranslation();
  const lines: ReactNode[] = [];
  if (credential.blocked) {
    const known = ["cooldown", "unavailable", "disabled", "weight"].includes(credential.blocked);
    lines.push(
      <span key="block" className="font-medium text-amber-700 dark:text-amber-300">
        {known
          ? t(`channel_groups_page.simulator.block.${credential.blocked}`)
          : credential.blocked}
      </span>,
    );
    const cause = normalizeCooldownReason(credential["block-cause"]);
    const details = [
      cause ? t(`auth_files.cooldown_reason.${cause}`) : "",
      credential["block-http-status"] ? `HTTP ${credential["block-http-status"]}` : "",
    ].filter(Boolean);
    if (details.length > 0) lines.push(<span key="cause">{details.join(" · ")}</span>);
    if (credential.blocked === "cooldown" || credential.blocked === "unavailable") {
      const left = msUntil(credential["blocked-until"], nowMs);
      lines.push(
        <span key="until" title={credential["blocked-until"]}>
          {left !== null
            ? t("channel_groups_page.simulator.block.until", { time: formatDuration(t, left) })
            : t("channel_groups_page.simulator.block.until_unknown")}
        </span>,
      );
    }
  } else if (credential.attempt) {
    lines.push(
      <span key="attempt" className="font-medium text-emerald-700 dark:text-emerald-300">
        {credential.attempt === 1
          ? t("channel_groups_page.simulator.attempt_first")
          : t("channel_groups_page.simulator.attempt_nth", { n: credential.attempt })}
      </span>,
    );
    if (credential.saturated) {
      lines.push(<span key="queued">{t("channel_groups_page.simulator.queued")}</span>);
    }
  } else {
    lines.push(<span key="idle">{t("channel_groups_page.simulator.not_reached")}</span>);
  }
  if (credential.reset) {
    const tier = ["room", "unknown", "low", "spent"].includes(credential.reset.tier)
      ? t(`channel_groups_page.simulator.reset.${credential.reset.tier}`)
      : credential.reset.tier;
    lines.push(<span key="tier">{tier}</span>);
    for (const window of credential.reset.windows ?? []) {
      const left = msUntil(window["resets-at"], nowMs);
      lines.push(
        <span key={`window-${window.key}`} className="text-ink-3">
          {left !== null
            ? t("channel_groups_page.simulator.reset.window", {
                key: window.key,
                used: percent(window.used),
                time: formatDuration(t, left),
              })
            : t("channel_groups_page.simulator.reset.window_no_reset", {
                key: window.key,
                used: percent(window.used),
              })}
        </span>,
      );
    }
  }
  return <div className="flex flex-col gap-0.5 text-xs leading-5 text-ink-2">{lines}</div>;
}

function GroupSection({ group, nowMs }: { group: RoutingSimulationGroup; nowMs: number }) {
  const { t, i18n } = useTranslation();
  const { candidates, excluded } = splitCredentials(group);
  const distribution = KNOWN_DISTRIBUTIONS.has(group.distribution)
    ? distributionLabel(t, group.distribution as RoutingDistribution)
    : group.distribution;
  const leastLoad = group.distribution === "least-load";
  return (
    <section className={`${surface({ tone: "inset" })} p-4`}>
      <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
        <span>
          {group.name
            ? t("channel_groups_page.simulator.group_name", { name: group.name })
            : t("channel_groups_page.simulator.group_any")}
        </span>
        {group.fallback ? (
          <span className="rounded-md bg-canvas px-1.5 py-0.5 text-2xs font-medium text-ink-3">
            {t("channel_groups_page.simulator.group_fallback")}
          </span>
        ) : null}
        <span className="text-xs font-normal text-ink-3">
          {distribution}
          {group.sticky ? ` · ${t("channel_groups_page.simulator.group_sticky")}` : ""}
        </span>
      </h4>
      {group.error ? (
        <div className="mt-2 text-xs text-ink-2">
          {t("channel_groups_page.simulator.group_error")} {errorLine(t, group.error)}
        </div>
      ) : null}
      {candidates.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] table-fixed text-left">
            <thead>
              <tr className="text-2xs text-ink-3">
                <th className="w-[38%] pb-1.5 font-medium">
                  {t("channel_groups_page.simulator.col_account")}
                </th>
                <th className="w-[34%] pb-1.5 font-medium">
                  {t("channel_groups_page.simulator.col_state")}
                </th>
                <th className="w-[8%] pb-1.5 font-medium">
                  {t("channel_groups_page.simulator.col_weight")}
                </th>
                <th className="w-[10%] pb-1.5 font-medium">
                  {t("channel_groups_page.simulator.col_concurrency")}
                </th>
                <th className="w-[10%] pb-1.5 font-medium">
                  {t("channel_groups_page.simulator.col_load")}
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((credential) => (
                <tr key={credential["auth-id"]} className="align-top">
                  <td className="py-1.5 pr-3">
                    <AccountCell credential={credential} />
                  </td>
                  <td className="py-1.5 pr-3">
                    <CredentialState credential={credential} nowMs={nowMs} />
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-ink-2 tabular-nums">
                    {credential.weight}
                  </td>
                  <td className="py-1.5 pr-3 text-xs text-ink-2 tabular-nums">
                    {credential["concurrency-limit"]
                      ? `${credential["in-flight"]}/${credential["concurrency-limit"]}`
                      : credential["in-flight"]}
                  </td>
                  <td className="py-1.5 text-xs text-ink-2 tabular-nums">
                    {percent(credential["load-ratio"])}
                    {leastLoad ? (
                      <span className="block text-ink-3">
                        {/* 后端在得分为 0 时省略这个字段。 */}
                        {t("channel_groups_page.simulator.score", {
                          score: (credential.score ?? 0).toFixed(2),
                        })}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {excluded.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-ink-3">
            {t("channel_groups_page.simulator.excluded_title", { count: excluded.length })}
          </summary>
          <ul className="mt-2 space-y-1">
            {excluded.map((credential) => (
              <li
                key={credential["auth-id"]}
                className="flex flex-wrap items-baseline gap-x-2 text-xs"
              >
                <span className="text-ink">{credentialName(credential)}</span>
                <span className="text-ink-3">
                  {exclusionReason(t, i18n.resolvedLanguage, credential)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function exclusionReason(
  t: T,
  language: string | undefined,
  credential: RoutingSimulationCredential,
): string {
  const excludedBy = credential["model-excluded-by"] ?? [];
  const notAllowedBy = credential["model-not-allowed-by"] ?? [];
  if (credential.excluded === "model" && excludedBy.length > 0) {
    return t("channel_groups_page.simulator.excluded.model_excluded_by", {
      groups: formatList(excludedBy, language),
    });
  }
  if (credential.excluded === "model" && notAllowedBy.length > 0) {
    return t("channel_groups_page.simulator.excluded.model_not_allowed_by", {
      groups: formatList(notAllowedBy, language),
    });
  }
  const reason = credential.excluded ?? "";
  return KNOWN_EXCLUSIONS.has(reason)
    ? t(`channel_groups_page.simulator.excluded.${reason}`)
    : reason;
}

function AccountCell({ credential }: { credential: RoutingSimulationCredential }) {
  const { t } = useTranslation();
  const name = credentialName(credential);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="truncate text-xs font-medium text-ink" title={name}>
          {name}
        </span>
        <ProviderTag vendor={credential.provider} withLogo>
          {credential.provider}
        </ProviderTag>
        {credential.shared ? (
          <span className="rounded-md bg-canvas px-1.5 py-0.5 text-2xs text-ink-3">
            {t("channel_groups_page.simulator.shared")}
          </span>
        ) : null}
      </div>
      {name !== credential["auth-id"] ? (
        <code
          className="block truncate font-mono text-2xs text-ink-3"
          title={credential["auth-id"]}
        >
          {credential["auth-id"]}
        </code>
      ) : null}
    </div>
  );
}

/** 结论的一句话：结果的标题，也是弹窗里给读屏播报的那句。 */
export function simulationHeadline(t: T, result: SimulationResult): string {
  const outcome = simulationOutcome(result);
  if (outcome.kind === "served") {
    const account = outcome.credential
      ? credentialName(outcome.credential)
      : outcome.attempt["auth-id"];
    return t("channel_groups_page.simulator.outcome_served", { account });
  }
  if (outcome.kind === "rejected") {
    return t("channel_groups_page.simulator.outcome_rejected", {
      stage: stageLabel(t, outcome.stage),
    });
  }
  return t("channel_groups_page.simulator.outcome_unavailable");
}

/** 模拟结果：结论、经过的检查、路由与模型策略、每个分组里的账号。 */
export function RoutingSimulationResult({
  result,
  nowMs,
}: {
  result: SimulationResult;
  nowMs: number;
}) {
  const { t, i18n } = useTranslation();
  const outcome = simulationOutcome(result);
  const headline = simulationHeadline(t, result);
  const selection = result.selection;
  const quotaSkipped = result.stages.some((s) => s.name === "quota" && s.outcome === "skipped");

  let summary: ReactNode;
  if (outcome.kind === "served") {
    summary = (
      <Callout tone="success" title={headline}>
        <span className="block">
          {t("channel_groups_page.simulator.outcome_served_detail", {
            group: outcome.attempt.group || t("channel_groups_page.simulator.group_any"),
            model: outcome.attempt["upstream-model"] || result.model || result["requested-model"],
          })}
        </span>
        {outcome.failovers > 0 ? (
          <span className="block">
            {t("channel_groups_page.simulator.outcome_failovers", { count: outcome.failovers })}
          </span>
        ) : null}
        {outcome.attempt.queued ? (
          <span className="block">{t("channel_groups_page.simulator.outcome_queued")}</span>
        ) : null}
      </Callout>
    );
  } else if (outcome.kind === "rejected") {
    summary = (
      <Callout tone="danger" title={headline}>
        {errorLine(t, outcome.error)}
      </Callout>
    );
  } else {
    const waitText =
      outcome.retryWaitKind === "busy-wait"
        ? t("channel_groups_page.simulator.outcome_wait_busy", {
            time: formatDuration(t, outcome.retryWaitMs),
          })
        : outcome.retryWaitKind === "request-retry"
          ? t("channel_groups_page.simulator.outcome_wait_retry", {
              time: formatDuration(t, outcome.retryWaitMs),
            })
          : t("channel_groups_page.simulator.outcome_fail_now");
    summary = (
      <Callout tone="warning" title={headline}>
        {errorLine(t, outcome.error)}
        <span className="mt-1 block">{waitText}</span>
      </Callout>
    );
  }

  const route = result.route;
  const policy = result["model-policy"];
  const facts: ReactNode[] = [];
  if (route?.group || route?.["route-path"]) {
    const routeFact = {
      path: route["route-path"] || "/v1",
      group: route.group || t("channel_groups_page.simulator.group_any"),
    };
    facts.push(
      <li key="route">
        {route.fallback
          ? t("channel_groups_page.simulator.fact_route_with_fallback", {
              ...routeFact,
              fallback: route.fallback,
            })
          : t("channel_groups_page.simulator.fact_route", routeFact)}
      </li>,
    );
  }
  if (policy?.["final-model"] && policy["final-model"] !== policy["requested-model"]) {
    const policyFact = {
      from: policy["requested-model"] || result["requested-model"],
      to: policy["final-model"],
    };
    facts.push(
      <li key="policy">
        {policy["route-id"]
          ? t("channel_groups_page.simulator.fact_policy_with_rule", {
              ...policyFact,
              id: policy["route-id"],
            })
          : t("channel_groups_page.simulator.fact_policy", policyFact)}
      </li>,
    );
  }
  if (selection) {
    facts.push(
      <li key="model">
        {t("channel_groups_page.simulator.fact_model", { model: selection.model })}
        {selection.providers.length > 0
          ? ` · ${t("channel_groups_page.simulator.fact_providers", {
              providers: formatList(selection.providers, i18n.resolvedLanguage),
            })}`
          : ""}
      </li>,
    );
  }

  return (
    <div className="space-y-4">
      {summary}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-ink">
          {t("channel_groups_page.simulator.stages_title")}
        </h4>
        <StageStrip stages={result.stages} />
        {quotaSkipped ? (
          <p className="text-xs leading-5 text-ink-3">
            {t("channel_groups_page.simulator.quota_skipped_hint")}
          </p>
        ) : null}
      </div>
      {facts.length > 0 ? (
        <ul className="space-y-1 text-xs leading-5 text-ink-2">{facts}</ul>
      ) : null}
      {selection && selection.groups.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-ink">
            {t("channel_groups_page.simulator.groups_title")}
          </h4>
          {selection.groups.map((group, index) => (
            <GroupSection key={`${group.name}-${index}`} group={group} nowMs={nowMs} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
