// Loop protection in the request log: the kinds the backend files requests under,
// the filter over them and the words for the status tag. Split out of
// requestLogsShared.tsx, which holds the table.

/** request_logs.guard_kind of a reply the gateway cut. */
export const GUARD_KIND_REPLY_LOOP = "reply_loop";
/** request_logs.guard_kind of a request the gateway answered itself, upstream never called. */
export const GUARD_KIND_TOOL_LOOP = "tool_loop";

/**
 * The kind a log item carries: a kind this panel does not know is kept as it came (it
 * still gets the amber tag), absent on a backend without loop protection.
 */
export const normalizeGuardKind = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

/** One choice of the loop protection filter. */
export type GuardFilterValue =
  | "all"
  | "any"
  | typeof GUARD_KIND_REPLY_LOOP
  | typeof GUARD_KIND_TOOL_LOOP;

export const isGuardFilterValue = (value: string): value is GuardFilterValue =>
  value === "all" ||
  value === "any" ||
  value === GUARD_KIND_REPLY_LOOP ||
  value === GUARD_KIND_TOOL_LOOP;

/** The guard_kinds query of a choice; undefined means no restriction. */
export function guardKindsOfFilter(value: GuardFilterValue): string[] | undefined {
  switch (value) {
    case "any":
      return [GUARD_KIND_REPLY_LOOP, GUARD_KIND_TOOL_LOOP];
    case GUARD_KIND_REPLY_LOOP:
      return [GUARD_KIND_REPLY_LOOP];
    case GUARD_KIND_TOOL_LOOP:
      return [GUARD_KIND_TOOL_LOOP];
    default:
      return undefined;
  }
}

/**
 * Whether the filter is offered at all. A backend without loop protection never is
 * (it would ignore the parameter and answer every request). One with it offers the
 * filter once there is something to filter, so tenants that never turn the checks on
 * do not get a control that only ever finds nothing; a choice already made keeps it
 * on screen, so it can be undone.
 */
export const guardFilterVisible = (
  supported: boolean,
  kinds: readonly string[],
  value: GuardFilterValue,
): boolean =>
  supported &&
  (value !== "all" ||
    kinds.includes(GUARD_KIND_REPLY_LOOP) ||
    kinds.includes(GUARD_KIND_TOOL_LOOP));

/**
 * The choices to list: all requests, and from the kinds the response says exist the
 * ones that select something (any of them only when there are two kinds, where it
 * differs from either). The current choice is always listed, even when the facet no
 * longer has its kind under the other filters, so the control never shows a value it
 * cannot name.
 */
export function guardFilterChoices(
  kinds: readonly string[],
  current: GuardFilterValue,
): GuardFilterValue[] {
  const replies = kinds.includes(GUARD_KIND_REPLY_LOOP);
  const tools = kinds.includes(GUARD_KIND_TOOL_LOOP);
  const choices: GuardFilterValue[] = ["all"];
  if (replies && tools) choices.push("any");
  if (replies) choices.push(GUARD_KIND_REPLY_LOOP);
  if (tools) choices.push(GUARD_KIND_TOOL_LOOP);
  if (!choices.includes(current)) choices.push(current);
  return choices;
}

/** What the amber status tag means, for its tooltip; a kind this panel does not know gets the general sentence. */
export function loopStoppedExplanation(t: (key: string) => string, kind: string): string {
  if (kind === GUARD_KIND_REPLY_LOOP) return t("request_logs.loop_stopped_reply");
  if (kind === GUARD_KIND_TOOL_LOOP) return t("request_logs.loop_stopped_tool");
  return t("request_logs.loop_stopped_other");
}
