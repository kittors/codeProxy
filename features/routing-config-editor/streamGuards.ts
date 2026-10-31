import type { RoutingConfigSupport } from "@code-proxy/api-client/endpoints/routing-config";
import type { RoutingChannelGroupEntry } from "@features/visual-config-editor";

/**
 * A channel group's stream guards, as CliRelay enforces them
 * (internal/config/routing_stream_guards.go):
 *
 * - `first-token-timeout-seconds` abandons a streaming attempt that has not
 *   produced its first token in time and, while the client has received
 *   nothing, retries it on another account. Unset or 0 is off.
 * - `busy-wait-max-seconds` caps how long a request waits when every account
 *   it may use is cooling down after a recoverable failure. Waiting is
 *   opt-in: unset and 0 are both off. They are still stored apart (an explicit
 *   0 survives a save), so a save never rewrites what the operator chose.
 *
 * Requests confined to one group use its values; every other request uses the
 * default group's. The backend rejects values outside these bounds with a 400,
 * so the editor checks them first.
 */
export const FIRST_TOKEN_TIMEOUT_MIN_SECONDS = 5;
export const FIRST_TOKEN_TIMEOUT_MAX_SECONDS = 300;
export const BUSY_WAIT_MAX_SECONDS = 240;

/** Both settings as typed. Blank is "unset"; for the wait it is kept apart from "0" although both are off. */
export type StreamGuardsDraft = {
  firstTokenTimeout: string;
  busyWaitMax: string;
};

type StreamGuardEntryFields = Pick<
  RoutingChannelGroupEntry,
  "firstTokenTimeoutSeconds" | "busyWaitMaxSeconds"
>;

export const emptyStreamGuardsDraft = (): StreamGuardsDraft => ({
  firstTokenTimeout: "",
  busyWaitMax: "",
});

export function streamGuardsFromEntry(entry: StreamGuardEntryFields): StreamGuardsDraft {
  return {
    firstTokenTimeout: entry.firstTokenTimeoutSeconds ? String(entry.firstTokenTimeoutSeconds) : "",
    busyWaitMax:
      typeof entry.busyWaitMaxSeconds === "number" ? String(entry.busyWaitMaxSeconds) : "",
  };
}

/** Blank → undefined, whole seconds → the number, anything else → NaN. */
const parseSeconds = (text: string): number | undefined => {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
};

export const isValidFirstTokenTimeout = (seconds: number | undefined): boolean =>
  seconds === undefined ||
  seconds === 0 ||
  (seconds >= FIRST_TOKEN_TIMEOUT_MIN_SECONDS && seconds <= FIRST_TOKEN_TIMEOUT_MAX_SECONDS);

export const isValidBusyWaitMax = (seconds: number | undefined): boolean =>
  seconds === undefined || (seconds >= 0 && seconds <= BUSY_WAIT_MAX_SECONDS);

/**
 * The i18n key for the first value that cannot be saved, or "". Only fields
 * the backend advertises are shown, so only those are checked: a hidden one
 * cannot be corrected.
 */
export function streamGuardsError(draft: StreamGuardsDraft, support: RoutingConfigSupport): string {
  if (
    support.channelGroupFirstTokenTimeout &&
    !isValidFirstTokenTimeout(parseSeconds(draft.firstTokenTimeout))
  ) {
    return "channel_groups_page.first_token_timeout_invalid";
  }
  if (support.channelGroupBusyWait && !isValidBusyWaitMax(parseSeconds(draft.busyWaitMax))) {
    return "channel_groups_page.busy_wait_invalid";
  }
  return "";
}

/**
 * The entry fields to save. A hidden field still passes through here
 * unchanged, so a save keeps what was stored.
 */
export function streamGuardsToEntry(draft: StreamGuardsDraft): StreamGuardEntryFields {
  const timeout = parseSeconds(draft.firstTokenTimeout);
  const wait = parseSeconds(draft.busyWaitMax);
  return {
    // 0 is off, the same as unset, so it is stored as unset.
    firstTokenTimeoutSeconds: timeout && Number.isFinite(timeout) ? timeout : undefined,
    busyWaitMaxSeconds: wait !== undefined && Number.isFinite(wait) ? wait : undefined,
  };
}
