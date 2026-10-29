/**
 * How much of the prompt an upstream served from its cache.
 *
 * Backends with separate cache columns report `cache_hit_rate`: cache reads over
 * the prompt tokens of the requests whose cache use is known, with
 * `cache_read_tokens` and `cache_write_tokens` beside it. It is null when no
 * request in the aggregate reported its cache use (rows logged before those
 * columns existed, upstreams that report nothing), which the console shows as
 * unknown rather than as a 0% hit rate.
 *
 * Older backends send only `cache_rate`: cached tokens over an estimate of the
 * input, where "cached" is cache reads or, when a request read nothing, cache
 * writes. That is a share of tokens, not a hit rate (the first turn of every
 * Claude conversation counts as a near-full hit), so it keeps its own label.
 * New backends still send `cache_rate` for older consoles; it is ignored here
 * whenever `cache_hit_rate` is present.
 */
export type CacheRateView =
  | {
      kind: "hit_rate";
      /** Percent (0-100); null when no request reported its cache use. */
      rate: number | null;
      readTokens: number;
      writeTokens: number;
    }
  | {
      kind: "token_share";
      /** Percent (0-100). */
      rate: number;
    };

export interface CacheRateFields {
  /** Deprecated on backends that send cache_hit_rate; see above. */
  cache_rate: number;
  /** Absent on backends without separate cache columns. */
  cache_hit_rate?: number | null;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

const finiteOrZero = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export function readCacheRate(source: Partial<CacheRateFields> | null | undefined): CacheRateView {
  if (source && source.cache_hit_rate !== undefined) {
    const rate = source.cache_hit_rate;
    return {
      kind: "hit_rate",
      rate:
        typeof rate === "number" && Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 100) : null,
      readTokens: finiteOrZero(source.cache_read_tokens),
      writeTokens: finiteOrZero(source.cache_write_tokens),
    };
  }
  return { kind: "token_share", rate: finiteOrZero(source?.cache_rate) };
}

/**
 * The percentage to show for a view, or null where the console shows "—": a
 * hit rate nobody reported, or a token share over an aggregate with no input.
 */
export function cacheRatePercent(view: CacheRateView, hasInput: boolean): number | null {
  if (view.kind === "hit_rate") return view.rate;
  return hasInput ? view.rate : null;
}

/**
 * Copies the cache fields of a raw aggregate as they came: a backend that sends
 * no `cache_hit_rate` key leaves it undefined, which is what tells the two
 * kinds of backend apart, and null stays null.
 */
export function pickCacheRateFields(raw: unknown): CacheRateFields {
  const record =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const fields: CacheRateFields = { cache_rate: finiteOrZero(record.cache_rate) };
  if (Object.prototype.hasOwnProperty.call(record, "cache_hit_rate")) {
    const rate = record.cache_hit_rate;
    fields.cache_hit_rate = typeof rate === "number" && Number.isFinite(rate) ? rate : null;
    fields.cache_read_tokens = finiteOrZero(record.cache_read_tokens);
    fields.cache_write_tokens = finiteOrZero(record.cache_write_tokens);
  }
  return fields;
}

/**
 * A request's own cache use. Rows from backends with separate cache columns
 * carry `cache_read_tokens` and `cache_write_tokens`, null when the request's
 * cache use is unknown; older backends send neither key.
 */
export type RequestCacheUse =
  | { kind: "known"; readTokens: number; writeTokens: number }
  | {
      kind: "unknown";
      /** The legacy cached_tokens: reads, or writes when the request read nothing. */
      legacyCachedTokens: number;
    }
  | { kind: "legacy"; cachedTokens: number };

export function readRequestCacheUse(row: {
  cached_tokens?: number | null;
  cache_read_tokens?: number | null;
  cache_write_tokens?: number | null;
}): RequestCacheUse {
  if (row.cache_read_tokens === undefined) {
    return { kind: "legacy", cachedTokens: finiteOrZero(row.cached_tokens) };
  }
  if (row.cache_read_tokens === null || !Number.isFinite(Number(row.cache_read_tokens))) {
    return { kind: "unknown", legacyCachedTokens: finiteOrZero(row.cached_tokens) };
  }
  return {
    kind: "known",
    readTokens: finiteOrZero(row.cache_read_tokens),
    writeTokens: finiteOrZero(row.cache_write_tokens),
  };
}
