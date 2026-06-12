export interface ApiSuccessEnvelope<T> {
  data?: T;
  result?: T;
  success?: boolean;
  code?: number | string;
  status?: number | string;
  message?: string;
  error?: unknown;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T>;

export type ApiListPayload<T> =
  | T[]
  | {
      data?: T[];
      result?: T[];
      items?: T[];
      list?: T[];
      rows?: T[];
    };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const isApiEnvelope = (value: unknown): value is ApiSuccessEnvelope<unknown> => {
  if (!isRecord(value)) return false;
  return (
    "data" in value ||
    "result" in value ||
    "success" in value ||
    "code" in value ||
    "status" in value ||
    "message" in value
  );
};

export const unwrapApiEnvelope = <T>(payload: unknown): T => {
  if (!isApiEnvelope(payload)) return payload as T;

  const record = payload as Record<string, unknown>;
  if ("data" in record) return record.data as T;
  if ("result" in record) return record.result as T;
  return payload as T;
};

export const ensureArrayPayload = <T>(payload: ApiListPayload<T> | unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  if (!isRecord(payload)) return [];

  for (const key of ["data", "result", "items", "list", "rows"] as const) {
    const value = payload[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
};
