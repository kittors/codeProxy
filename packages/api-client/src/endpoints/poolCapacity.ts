import { apiClient } from "../client/client";

/**
 * What is left of one quota window across the accounts of one provider.
 *
 * `remaining_percent` is the arithmetic mean of the accounts' remaining percentages (not of what is
 * used), so a pool at 38% has, on average, 38% of that window left per account.
 */
export interface PoolCapacityEntry {
  provider: string;
  /** The window as the upstream names it (`code_week`, `five_hour`, …). */
  window_key: string;
  /** The upstream's own English name for the window; the fallback when the panel has no name for the key. */
  window_label: string;
  window_seconds: number;
  accounts: number;
  accounts_with_data: number;
  remaining_percent: number;
  earliest_reset_at?: string;
  /** Percentage points the pool loses per hour, a linear estimate over the last 6 hours. */
  burn_percent_per_hour?: number;
  /** Only present when the pool is expected to run out before it resets. */
  projected_exhaustion_at?: string;
  /** The oldest observation among the pool's accounts: how stale the figure can be. */
  observed_at?: string;
}

export interface PoolCapacityResponse {
  generated_at: string;
  pools: PoolCapacityEntry[];
}

export const poolCapacityApi = {
  get: (options?: { signal?: AbortSignal }) =>
    options?.signal
      ? apiClient.get<PoolCapacityResponse>("/ai-accounts/pool-capacity", {
          signal: options.signal,
        })
      : apiClient.get<PoolCapacityResponse>("/ai-accounts/pool-capacity"),
};
