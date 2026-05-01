export type QuotaStatus = "idle" | "loading" | "success" | "error";

export type QuotaItem = {
  key?: string;
  label: string;
  percent: number | null;
  resetAtMs?: number;
  windowSeconds?: number;
  meta?: string;
};

export type QuotaState = {
  status: QuotaStatus;
  items: QuotaItem[];
  error?: string;
  updatedAt?: number;
};
