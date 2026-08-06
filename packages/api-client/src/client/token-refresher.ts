import type { AuthBroadcast } from "./auth-broadcast";
import type { AuthGate } from "./auth-state";
import { applyRefreshedTokens, peekPersistedAuthSnapshot } from "./auth-storage";
import { REFRESH_MAX_ATTEMPTS, REFRESH_TIMEOUT_MS, REFRESH_TOTAL_BUDGET_MS } from "./constants";
import {
  classifyRefreshResponse,
  classifyRefreshThrow,
  refreshBackoffMs,
  retryAfterMs,
  type RefreshOutcome,
} from "./refresh-classify";
import { withRefreshLock } from "./refresh-lock";

/** Event consumed by AuthProvider to mirror rotated tokens into React state. */
export const AUTH_TOKEN_REFRESHED_EVENT = "auth-token-refreshed";

export interface TokenRefresherDeps {
  gate: AuthGate;
  broadcast: AuthBroadcast;
  /** Management API base (…/v0/management); the refresh endpoint sits beside it. */
  apiBase: () => string;
}

type RefreshedOutcome = Extract<RefreshOutcome, { kind: "refreshed" }>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const dispatchWindowEvent = (event: Event): void => {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(event);
  }
};

/**
 * Orchestrates refresh-token rotation for a single ApiClient.
 *
 * Three layers of de-duplication stack here, because each one covers a case the
 * others cannot: an in-process single-flight (many components 401 at once), a
 * cross-tab lock (many tabs 401 at once), and a snapshot re-read (the tab that
 * lost the lock adopts the winner's result instead of spending its own token).
 * Everything that fails to produce a verdict on the grant stays `transient`, so
 * a rate limit or an offline window never signs the user out.
 */
export class TokenRefresher {
  private inFlight: Promise<RefreshOutcome> | null = null;

  private inFlightGeneration = -1;

  /** Highest rotation this client has already consumed; 0 = nothing adopted yet. */
  private rotationSeq = 0;

  constructor(private readonly deps: TokenRefresherDeps) {}

  /** Drop cross-session state. Called whenever credentials are replaced. */
  reset(): void {
    this.inFlight = null;
    this.inFlightGeneration = -1;
    this.rotationSeq = 0;
  }

  getRotationSeq(): number {
    return this.rotationSeq;
  }

  /**
   * Adopt a token another tab persisted, if it is strictly newer than ours.
   *
   * The sequence number is the only usable freshness signal: refresh expiry can
   * legitimately move backwards (the backend caps it at the absolute session
   * deadline) and token strings cannot be ordered at all.
   */
  adoptPersistedRotation(rotationSeq: number, accountId?: string): boolean {
    if (rotationSeq <= this.rotationSeq) return false;
    const snapshot = peekPersistedAuthSnapshot();
    if (accountId && snapshot?.accountId && snapshot.accountId !== accountId) return false;
    return this.adoptFromSnapshot() !== null;
  }

  refresh(): Promise<RefreshOutcome> {
    const gate = this.deps.gate;
    if (!gate.hasRefreshToken()) return Promise.resolve<RefreshOutcome>({ kind: "no-credential" });

    const generation = gate.getGeneration();
    if (this.inFlight && this.inFlightGeneration === generation) return this.inFlight;

    this.inFlightGeneration = generation;
    const pending = this.runLocked(generation).finally(() => {
      if (this.inFlightGeneration !== generation) return;
      this.inFlight = null;
      this.inFlightGeneration = -1;
    });
    this.inFlight = pending;
    return pending;
  }

  private async runLocked(generation: number): Promise<RefreshOutcome> {
    const result = await withRefreshLock<RefreshOutcome>(
      () => this.runSequence(generation),
      // Polled while a peer holds the lock: returning non-null skips our own
      // network round-trip entirely, which is the whole point of the lock.
      () => Promise.resolve(this.adoptFromSnapshot()),
    );
    return result.value;
  }

  private async runSequence(generation: number): Promise<RefreshOutcome> {
    // The lock may have been won by a peer that finished before we polled.
    const preAdopted = this.adoptFromSnapshot();
    if (preAdopted) return preAdopted;

    const startedAt = Date.now();
    let outcome: RefreshOutcome = { kind: "transient", reason: "budget_exhausted" };

    for (let attempt = 0; attempt < REFRESH_MAX_ATTEMPTS; attempt += 1) {
      if (Date.now() - startedAt >= REFRESH_TOTAL_BUDGET_MS) {
        outcome = { kind: "transient", reason: "budget_exhausted" };
        break;
      }
      const attemptResult = await this.attempt();
      outcome = attemptResult.outcome;
      if (outcome.kind !== "transient") break;
      if (attempt === REFRESH_MAX_ATTEMPTS - 1) break;
      await sleep(attemptResult.retryAfter ?? refreshBackoffMs(attempt));
    }

    // An account switch during the round-trip makes the result belong to a
    // session that no longer exists; installing it would clobber the new one.
    if (this.deps.gate.getGeneration() !== generation) {
      return { kind: "transient", reason: "generation_changed" };
    }
    if (outcome.kind === "refreshed") {
      this.commit(outcome, generation);
      return outcome;
    }
    if (outcome.kind === "invalid") {
      // Our own token was already spent by a peer that rotated successfully;
      // its result is authoritative and keeps the session alive.
      const late = this.adoptFromSnapshot();
      if (late) return late;
    }
    return outcome;
  }

  private async attempt(): Promise<{ outcome: RefreshOutcome; retryAfter: number | null }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced rather than relying on the abort alone: a transport that ignores the
    // signal (or a stubbed fetch) would otherwise hang past the total budget.
    const timeout = new Promise<never>((_, reject) => {
      timer = globalThis.setTimeout(() => {
        controller.abort();
        const error = new Error("Refresh request timed out");
        error.name = "AbortError";
        reject(error);
      }, REFRESH_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        fetch(`${this.refreshUrl()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.deps.gate.getRefreshToken() }),
          signal: controller.signal,
        }),
        timeout,
      ]);
      return {
        outcome: await classifyRefreshResponse(response),
        retryAfter: retryAfterMs(response.headers.get("Retry-After")),
      };
    } catch (error) {
      return { outcome: classifyRefreshThrow(error), retryAfter: null };
    } finally {
      if (timer !== undefined) globalThis.clearTimeout(timer);
    }
  }

  private refreshUrl(): string {
    return `${this.deps.apiBase().replace(/\/v0\/management\/?$/, "")}/v0/auth/refresh`;
  }

  /**
   * Install a rotation produced by this client: memory, storage, peers, React.
   *
   * Storage is patched in place (never rewritten from the in-memory session) so
   * the medium chosen by "remember password" survives, and the persisted expiry
   * moves forward — leaving it at login time is what made a rotated session look
   * dead on the next page load.
   */
  private commit(outcome: RefreshedOutcome, generation: number): void {
    this.deps.gate.adoptRotated(outcome.accessToken, outcome.refreshToken);
    const rotationSeq = applyRefreshedTokens({
      managementKey: outcome.accessToken,
      ...(outcome.refreshToken ? { refreshToken: outcome.refreshToken } : {}),
      ...(outcome.expiresAtMs !== undefined ? { expiresAtMs: outcome.expiresAtMs } : {}),
      ...(outcome.refreshExpiresAtMs !== undefined
        ? { refreshExpiresAtMs: outcome.refreshExpiresAtMs }
        : {}),
    });
    if (rotationSeq !== null) this.rotationSeq = rotationSeq;
    // Read after the patch: an expired record is invisible to the snapshot
    // reader until the fresh expiry has been written back.
    const accountId = peekPersistedAuthSnapshot()?.accountId;
    this.deps.broadcast.publish({
      type: "token-rotated",
      rotationSeq: this.rotationSeq,
      ...(accountId ? { accountId } : {}),
    });
    this.emitRefreshed(outcome, generation);
  }

  /** Take over a token a peer already persisted. Returns null when ours is current. */
  private adoptFromSnapshot(): RefreshOutcome | null {
    const snapshot = peekPersistedAuthSnapshot();
    const accessToken = snapshot?.managementKey?.trim() ?? "";
    const rotationSeq = snapshot?.rotationSeq ?? 0;
    if (!accessToken || rotationSeq <= this.rotationSeq) return null;
    if (accessToken === this.deps.gate.getManagementKey()) return null;

    const refreshToken = snapshot?.refreshToken ?? "";
    this.deps.gate.adoptRotated(accessToken, refreshToken);
    this.rotationSeq = rotationSeq;
    const outcome: RefreshedOutcome = {
      kind: "refreshed",
      accessToken,
      refreshToken,
      ...(snapshot?.expiresAtMs !== undefined ? { expiresAtMs: snapshot.expiresAtMs } : {}),
      ...(snapshot?.refreshExpiresAtMs !== undefined
        ? { refreshExpiresAtMs: snapshot.refreshExpiresAtMs }
        : {}),
    };
    // No broadcast: the peer that produced this rotation already published it.
    this.emitRefreshed(outcome, this.deps.gate.getGeneration());
    return outcome;
  }

  private emitRefreshed(outcome: RefreshedOutcome, generation: number): void {
    dispatchWindowEvent(
      new CustomEvent(AUTH_TOKEN_REFRESHED_EVENT, {
        detail: {
          accessToken: outcome.accessToken,
          refreshToken: outcome.refreshToken,
          expiresAtMs: outcome.expiresAtMs,
          refreshExpiresAtMs: outcome.refreshExpiresAtMs,
          rotationSeq: this.rotationSeq,
          authGeneration: generation,
        },
      }),
    );
  }
}
