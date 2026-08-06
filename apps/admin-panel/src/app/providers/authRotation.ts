import type { AuthBroadcastMessage } from "@code-proxy/api-client";

export interface AdoptRotationInput {
  /** Account this tab is signed in as, when known. */
  currentAccountId?: string | null;
  message: Extract<AuthBroadcastMessage, { type: "token-rotated" }>;
  /** Highest rotation sequence this tab has already applied. */
  localRotationSeq: number;
}

/**
 * Decide whether a rotation broadcast from another tab applies to this one.
 *
 * The message carries no token — only a sequence number and the account it
 * belongs to — so this is purely a freshness and ownership check; the caller
 * re-reads its own snapshot afterwards. Sequence is the ordering key because
 * neither expiry nor the token string can be ordered: the refresh lifetime can
 * legitimately shrink, and tokens are opaque random strings.
 */
export function shouldAdoptRotation(input: AdoptRotationInput): boolean {
  const { currentAccountId, message, localRotationSeq } = input;
  // Both sides naming an account and disagreeing means two different sessions
  // share an origin; adopting would hand this tab the other account's session.
  if (currentAccountId && message.accountId && currentAccountId !== message.accountId) {
    return false;
  }
  return message.rotationSeq > localRotationSeq;
}
