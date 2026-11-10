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
   * USD the proxy spent inside the window so far (backend `used_cost_usd`).
   * Undefined when the backend cannot tell, which is not the same as 0.
   */
  usedCostUsd?: number;
};

export type QuotaState = {
  status: QuotaStatus;
  items: QuotaItem[];
  planType?: string;
  resetCreditCount?: number;
  resetCreditExpirations?: string[];
  error?: string;
  updatedAt?: number;
};
