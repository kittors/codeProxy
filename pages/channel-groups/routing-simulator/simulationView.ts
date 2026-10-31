import type {
  RoutingSimulationAttempt,
  RoutingSimulationCredential,
  RoutingSimulationError,
  RoutingSimulationGroup,
  RoutingSimulationResult,
} from "@code-proxy/api-client/endpoints/routing-simulation";

/** 一次模拟的结论：被哪个阶段拒绝、由哪个账号接，或者没有账号能接。 */
export type SimulationOutcome =
  | { kind: "rejected"; stage: string; error: RoutingSimulationError }
  | {
      kind: "served";
      attempt: RoutingSimulationAttempt;
      credential: RoutingSimulationCredential | undefined;
      /** 首选失败时还能依次换到的账号数。 */
      failovers: number;
    }
  | {
      kind: "unavailable";
      error: RoutingSimulationError | undefined;
      retryWaitMs: number;
      /** request-retry / busy-wait；不给表示立即失败。 */
      retryWaitKind: string | undefined;
    };

export function simulationOutcome(result: RoutingSimulationResult): SimulationOutcome {
  if (result.rejection) {
    const stage =
      result.rejection.stage ?? result.stages.find((s) => s.outcome === "rejected")?.name ?? "";
    return { kind: "rejected", stage, error: result.rejection };
  }
  const selection = result.selection;
  const first = selection?.attempts[0];
  if (selection && first) {
    return {
      kind: "served",
      attempt: first,
      credential: findCredential(selection.groups, first),
      failovers: selection.attempts.length - 1,
    };
  }
  return {
    kind: "unavailable",
    error: selection?.error,
    retryWaitMs: selection?.["retry-wait-ms"] ?? 0,
    retryWaitKind: selection?.["retry-wait-kind"] || undefined,
  };
}

/** 尝试对应的账号：先找它被选中的那个分组，找不到再全局找。 */
export function findCredential(
  groups: RoutingSimulationGroup[],
  attempt: Pick<RoutingSimulationAttempt, "auth-id" | "group">,
): RoutingSimulationCredential | undefined {
  const inGroup = groups
    .find((group) => group.name === attempt.group)
    ?.credentials.find((credential) => credential["auth-id"] === attempt["auth-id"]);
  if (inGroup) return inGroup;
  for (const group of groups) {
    const found = group.credentials.find((c) => c["auth-id"] === attempt["auth-id"]);
    if (found) return found;
  }
  return undefined;
}

export const credentialName = (
  credential: Pick<RoutingSimulationCredential, "label" | "auth-id">,
) => credential.label?.trim() || credential["auth-id"];

const byName = (a: RoutingSimulationCredential, b: RoutingSimulationCredential) =>
  credentialName(a).localeCompare(credentialName(b)) || a["auth-id"].localeCompare(b["auth-id"]);

/**
 * 分组里的账号分成两组：候选按尝试顺序排在前（会被尝试的在前，冷却等接不了的按名字排在后），
 * 不参与的单列，按名字排。
 */
export function splitCredentials(group: RoutingSimulationGroup): {
  candidates: RoutingSimulationCredential[];
  excluded: RoutingSimulationCredential[];
} {
  const candidates = group.credentials.filter((c) => !c.excluded);
  const excluded = group.credentials.filter((c) => Boolean(c.excluded)).sort(byName);
  candidates.sort((a, b) => {
    const aAttempt = a.attempt ?? 0;
    const bAttempt = b.attempt ?? 0;
    if (aAttempt > 0 && bAttempt > 0) return aAttempt - bAttempt;
    if (aAttempt > 0) return -1;
    if (bAttempt > 0) return 1;
    return byName(a, b);
  });
  return { candidates, excluded };
}

export type DurationUnit = "second" | "minute" | "hour" | "day";

/**
 * 时长取一个最合适的单位，只留一个整数：「约 2 分钟」比「1 分 31 秒」好读，冷却和重置时间
 * 本来也只精确到这个程度。一小时以内向上取整（至少 1 秒），再往上按小时、天四舍五入：
 * 文案都带「约」，61 分钟说「约 1 小时」比「约 2 小时」更接近。
 */
export function durationParts(ms: number): { unit: DurationUnit; count: number } {
  const seconds = Math.max(1, Math.ceil(Math.max(0, ms) / 1000));
  if (seconds < 60) return { unit: "second", count: seconds };
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return { unit: "minute", count: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { unit: "hour", count: hours };
  return { unit: "day", count: Math.round(hours / 24) };
}

/** RFC 3339 时间到现在的毫秒数；解析不了时为 null。 */
export function msUntil(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? at - nowMs : null;
}

export const percent = (ratio: number) => `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`;

/** 「A、B 和 C」这样的列举，按界面语言连接。 */
export function formatList(items: readonly string[], language: string | undefined): string {
  try {
    return new Intl.ListFormat(language || undefined, { type: "conjunction" }).format(items);
  } catch {
    return items.join(", ");
  }
}
