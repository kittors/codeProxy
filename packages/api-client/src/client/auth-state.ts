import { ApiError } from "./errors";

export type AuthState = "anonymous" | "active" | "suspended";
/** "anonymous" is the login endpoint only: it is the request that mints credentials. */
export type AuthRequirement = "required" | "anonymous";

export const AUTH_NOT_CONFIGURED = "auth_not_configured";
export const AUTH_SUSPENDED = "auth_suspended";
export const AUTH_REFRESH_UNAVAILABLE = "auth_refresh_unavailable";

/**
 * No credential is configured, so the request never left the process.
 * isAuthError stays false on purpose: a caller that treats this as an auth
 * failure would suspend the gate, which re-produces the same error forever.
 */
export const createAuthNotConfiguredError = (): ApiError =>
  new ApiError({
    message: "No management credential is configured.",
    status: 0,
    payload: { code: AUTH_NOT_CONFIGURED },
    isAuthError: false,
  });

/** The session was explicitly invalidated; callers must sign in again. */
export const createAuthSuspendedError = (): ApiError =>
  new ApiError({
    message: "Management session is no longer valid. Please sign in again.",
    status: 401,
    payload: { code: AUTH_SUSPENDED },
    isAuthError: true,
  });

/**
 * Refresh could not be completed for a reason that says nothing about the
 * grant (rate limit, 5xx, offline, timeout). isAuthError is false so the
 * session survives — signing the user out here is exactly the defect this
 * error code exists to prevent.
 */
export const createAuthRefreshUnavailableError = (): ApiError =>
  new ApiError({
    message: "Authentication service is temporarily unreachable. Please retry.",
    status: 0,
    payload: { code: AUTH_REFRESH_UNAVAILABLE },
    isAuthError: false,
  });

/**
 * Three-state egress gate for management traffic.
 *
 * The state is derived from the credentials rather than tracked independently,
 * so "gate open but token empty" — the window that leaked credential-less
 * requests after logout — cannot be expressed.
 */
export class AuthGate {
  private state: AuthState = "anonymous";

  private managementKey = "";

  private refreshToken = "";

  private generation = 0;

  /**
   * Replace credentials. `undefined` keeps the current value; a string (or
   * null for refreshToken) replaces it.
   */
  configure(next: { managementKey?: string; refreshToken?: string | null }): void {
    if (next.managementKey !== undefined) this.managementKey = next.managementKey.trim();
    if (next.refreshToken !== undefined) this.refreshToken = (next.refreshToken ?? "").trim();
    // Every reconfiguration is a potential account switch: bump the generation so
    // in-flight refreshes and late 401s from the previous session are discarded.
    this.generation += 1;
    // Deliberately NOT an unconditional reset of "suspended": the gate opens only
    // because a credential exists. Clearing the key on logout must leave the gate
    // shut, not merely un-suspended.
    this.state = this.managementKey ? "active" : "anonymous";
  }

  /** Idempotent; returns true only on the transition, so callers emit one event. */
  suspend(): boolean {
    if (this.state === "suspended") return false;
    this.state = "suspended";
    return true;
  }

  /**
   * Install tokens produced by a successful refresh. The generation is left
   * untouched: rotation continues the same session, and bumping it here would
   * cancel the very request that triggered the refresh.
   */
  adoptRotated(accessToken: string, refreshToken: string): void {
    this.managementKey = accessToken.trim();
    if (refreshToken.trim()) this.refreshToken = refreshToken.trim();
    this.state = this.managementKey ? "active" : "anonymous";
  }

  assertCanSend(requirement: AuthRequirement): void {
    if (requirement === "anonymous") return;
    if (this.state === "anonymous") throw createAuthNotConfiguredError();
    if (this.state === "suspended") throw createAuthSuspendedError();
  }

  isUsable(): boolean {
    return this.state === "active";
  }

  getState(): AuthState {
    return this.state;
  }

  getGeneration(): number {
    return this.generation;
  }

  hasRefreshToken(): boolean {
    return Boolean(this.refreshToken);
  }

  getManagementKey(): string {
    return this.managementKey;
  }

  getRefreshToken(): string {
    return this.refreshToken;
  }
}
