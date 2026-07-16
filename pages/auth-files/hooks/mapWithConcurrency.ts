/**
 * Run async work over items with a hard concurrency cap.
 * Used by AI Accounts cycle-usage fan-out so card loads cannot open
 * unbounded /usage/auth-file-trend storms against the backend.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const run = async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      try {
        const value = await worker(items[current]);
        results[current] = { status: "fulfilled", value };
      } catch (reason) {
        results[current] = { status: "rejected", reason };
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => run()));
  return results;
}
