import { describe, expect, test } from "vitest";
import {
  cacheRatePercent,
  pickCacheRateFields,
  readCacheRate,
  readRequestCacheUse,
} from "../cacheRate";

describe("cache rate", () => {
  test("reads an older backend's cache_rate as a token share", () => {
    expect(readCacheRate({ cache_rate: 91.2 })).toEqual({ kind: "token_share", rate: 91.2 });
    expect(readCacheRate(null)).toEqual({ kind: "token_share", rate: 0 });
    expect(readCacheRate({ cache_rate: Number.NaN })).toEqual({ kind: "token_share", rate: 0 });
  });

  test("prefers cache_hit_rate whenever the backend sends it, null included", () => {
    // cache_rate is the deprecated mirror a newer backend still sends.
    expect(
      readCacheRate({
        cache_rate: 0,
        cache_hit_rate: 45.5,
        cache_read_tokens: 900,
        cache_write_tokens: 1000,
      }),
    ).toEqual({ kind: "hit_rate", rate: 45.5, readTokens: 900, writeTokens: 1000 });
    expect(readCacheRate({ cache_rate: 0, cache_hit_rate: null })).toEqual({
      kind: "hit_rate",
      rate: null,
      readTokens: 0,
      writeTokens: 0,
    });
    expect(readCacheRate({ cache_rate: 0, cache_hit_rate: 140 })).toMatchObject({ rate: 100 });
  });

  test("shows nothing for an unknown hit rate, or a token share without input", () => {
    expect(
      cacheRatePercent({ kind: "hit_rate", rate: null, readTokens: 0, writeTokens: 0 }, true),
    ).toBeNull();
    expect(
      cacheRatePercent({ kind: "hit_rate", rate: 0, readTokens: 0, writeTokens: 5 }, false),
    ).toBe(0);
    expect(cacheRatePercent({ kind: "token_share", rate: 12 }, true)).toBe(12);
    expect(cacheRatePercent({ kind: "token_share", rate: 0 }, false)).toBeNull();
  });

  test("keeps absent apart from null when picking the fields of a raw aggregate", () => {
    const older = pickCacheRateFields({ cache_rate: 30 });
    expect(older).toEqual({ cache_rate: 30 });
    expect(Object.prototype.hasOwnProperty.call(older, "cache_hit_rate")).toBe(false);

    expect(pickCacheRateFields({ cache_rate: 0, cache_hit_rate: null })).toEqual({
      cache_rate: 0,
      cache_hit_rate: null,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
    });
    expect(
      pickCacheRateFields({
        cache_rate: 40,
        cache_hit_rate: 40,
        cache_read_tokens: "400",
        cache_write_tokens: -3,
      }),
    ).toEqual({
      cache_rate: 40,
      cache_hit_rate: 40,
      cache_read_tokens: 400,
      cache_write_tokens: 0,
    });
    expect(pickCacheRateFields(undefined)).toEqual({ cache_rate: 0 });
  });

  test("reads a request's cache use", () => {
    expect(readRequestCacheUse({ cached_tokens: 50000 })).toEqual({
      kind: "legacy",
      cachedTokens: 50000,
    });
    expect(
      readRequestCacheUse({
        cached_tokens: 50000,
        cache_read_tokens: null,
        cache_write_tokens: null,
      }),
    ).toEqual({ kind: "unknown", legacyCachedTokens: 50000 });
    // A turn that only wrote the cache: the legacy figure holds the write.
    expect(
      readRequestCacheUse({
        cached_tokens: 50000,
        cache_read_tokens: 0,
        cache_write_tokens: 50000,
      }),
    ).toEqual({ kind: "known", readTokens: 0, writeTokens: 50000 });
  });
});
