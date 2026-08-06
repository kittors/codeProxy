export const AUTH_CHANNEL_NAME = "code-proxy-admin-auth";

/**
 * Cross-tab auth signals.
 *
 * Signal only — these messages deliberately carry NO token material. When
 * "remember password" is off the auth snapshot lives in sessionStorage, which
 * is per-tab isolation the user opted into; broadcasting the token itself would
 * break that isolation and hand any same-origin XSS a passive harvesting
 * channel. Receivers re-read their own snapshot instead, and a tab that cannot
 * see the winner's token simply refreshes with its own — still accepted inside
 * the backend's refresh grace window.
 */
export type AuthBroadcastMessage =
  | { type: "token-rotated"; accountId?: string; rotationSeq: number }
  | { type: "signed-out"; code: string };

const isAuthBroadcastMessage = (value: unknown): value is AuthBroadcastMessage => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.type === "token-rotated") return typeof record.rotationSeq === "number";
  return record.type === "signed-out" && typeof record.code === "string";
};

/**
 * Re-build the wire payload field by field so the no-token guarantee is
 * structural instead of merely a TypeScript claim: an object that carries extra
 * properties (a widened type, a future refactor) cannot leak them by accident.
 */
const toWireMessage = (message: AuthBroadcastMessage): AuthBroadcastMessage => {
  if (message.type === "signed-out") return { type: "signed-out", code: message.code };
  return {
    type: "token-rotated",
    rotationSeq: message.rotationSeq,
    ...(message.accountId ? { accountId: message.accountId } : {}),
  };
};

/**
 * BroadcastChannel wrapper that degrades to a no-op when the API is missing
 * (older WebViews, some embedded browsers). Cross-tab coordination is an
 * optimisation; auth must keep working without it.
 */
export class AuthBroadcast {
  private channel: BroadcastChannel | null = null;

  private handlers = new Set<(message: AuthBroadcastMessage) => void>();

  constructor(name: string = AUTH_CHANNEL_NAME) {
    try {
      if (typeof BroadcastChannel === "undefined") return;
      this.channel = new BroadcastChannel(name);
      this.channel.onmessage = (event: MessageEvent) => {
        if (!isAuthBroadcastMessage(event.data)) return;
        for (const handler of this.handlers) handler(event.data);
      };
    } catch {
      this.channel = null;
    }
  }

  publish(message: AuthBroadcastMessage): void {
    try {
      this.channel?.postMessage(toWireMessage(message));
    } catch {
      /* A closed or unavailable channel must never break the auth flow. */
    }
  }

  subscribe(handler: (message: AuthBroadcastMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  close(): void {
    this.handlers.clear();
    try {
      this.channel?.close();
    } catch {
      /* ignore */
    }
    this.channel = null;
  }
}

let sharedBroadcast: AuthBroadcast | null = null;

/**
 * The channel shared by ApiClient and AuthProvider inside one tab.
 *
 * They must not open one each: BroadcastChannel delivers to every *other*
 * object registered on the name, including siblings in the same tab. Two
 * instances would therefore make this tab react to its own sign-out as if a
 * peer had sent it — clearing the session a second time and overwriting the
 * failure code the login screen is about to show.
 */
export const getAuthBroadcast = (): AuthBroadcast => {
  sharedBroadcast ??= new AuthBroadcast();
  return sharedBroadcast;
};

export const subscribeAuthBroadcast = (
  handler: (message: AuthBroadcastMessage) => void,
): (() => void) => getAuthBroadcast().subscribe(handler);

/** Tell other tabs the session is over. The sender is never its own receiver. */
export const publishSignedOut = (code: string): void => {
  getAuthBroadcast().publish({ type: "signed-out", code });
};
