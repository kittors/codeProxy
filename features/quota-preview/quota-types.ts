export type QuotaStatus = "idle" | "loading" | "success" | "error";

export type QuotaItem = {
  key?: string;
  label: string;
  percent: number | null;
  value?: string;
  resetAtMs?: number;
  windowSeconds?: number;
  meta?: string;
  /**
   * When the upstream last confirmed this window. Windows the upstream omitted
   * from recent payloads keep an older value than their siblings, so staleness is
   * per-window rather than per-card. Undefined means unknown (legacy payloads).
   */
  observedAtMs?: number;
};

export type QuotaState = {
  status: QuotaStatus;
  items: QuotaItem[];
  planType?: string;
  resetCreditCount?: number;
  resetCreditExpirations?: string[];
  error?: string;
  updatedAt?: number;
  /**
   * Newest per-window observation for the card. Distinct from updatedAt, which
   * only tells when the backend row was last touched — including by a failed
   * probe that refreshed nothing.
   */
  quotaObservedAtMs?: number;
};
