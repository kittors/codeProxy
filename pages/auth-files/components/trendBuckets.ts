/** Local-time bucket keys for the auth-file usage trend chart. */
const padTwo = (value: number) => String(value).padStart(2, "0");

export const formatLocalDateKey = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
};

export const formatLocalHourKey = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${formatLocalDateKey(timestamp)} ${padTwo(date.getHours())}:00`;
};

/** Parse a server bucket key ("2026-04-30" / "2026-04-30 16:00") as local time. */
export const parseBucketKeyMs = (key: string): number => {
  const [datePart = "", timePart = ""] = key.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0] = timePart ? timePart.split(":").map(Number) : [];
  if (!year || !month || !day) return Number.NaN;
  return new Date(year, month - 1, day, hour, minute).getTime();
};

/**
 * Quota points carry ISO timestamps while x-axis buckets arrive pre-formatted in the
 * server's timezone. Exact key matching drops the whole series whenever those two
 * timezones differ, so fall back to the closest bucket within one bucket width.
 */
export const resolveNearestBucketKey = (
  timestamp: string,
  bucketKeys: string[],
  bucketMsByKey: Map<string, number>,
  toleranceMs: number,
): string | null => {
  const pointMs = new Date(timestamp).getTime();
  if (Number.isNaN(pointMs)) return null;
  let bestKey: string | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const key of bucketKeys) {
    const bucketMs = bucketMsByKey.get(key);
    if (bucketMs === undefined || Number.isNaN(bucketMs)) continue;
    const delta = Math.abs(bucketMs - pointMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestKey = key;
    }
  }
  return bestKey !== null && bestDelta <= toleranceMs ? bestKey : null;
};
