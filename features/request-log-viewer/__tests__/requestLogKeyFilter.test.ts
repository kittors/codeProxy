import { describe, expect, test } from "vitest";
import type { UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
import {
  buildRequestLogKeyOptionsFromFacet,
  EMPTY_REQUEST_LOG_KEY_FACET,
  maskRequestLogApiKey,
  readRequestLogKeyFacet,
  requestLogKeyFilterQuery,
  shortRequestLogKeyId,
  SYSTEM_REQUEST_LOG_FILTER_VALUE,
} from "..";

const labels = { allKeys: "All users", systemCall: "System call" };

const emptyFilters: UsageLogsResponse["filters"] = {
  api_key_ids: [],
  api_key_id_names: {},
  api_key_id_counts: {},
  api_keys: [],
  api_key_names: {},
  api_key_counts: {},
  models: [],
  channels: [],
  channel_options: [],
  statuses: [],
  guard_kinds: [],
};

describe("readRequestLogKeyFacet", () => {
  test("reads the key ids of a backend that declares the id filters", () => {
    const facet = readRequestLogKeyFacet({
      capabilities: { apiKeyIdFilters: true, loopGuard: false },
      filters: {
        ...emptyFilters,
        api_key_ids: ["key-a", SYSTEM_REQUEST_LOG_FILTER_VALUE],
        api_key_id_names: { "key-a": "Alice" },
        api_key_id_counts: { "key-a": 7, [SYSTEM_REQUEST_LOG_FILTER_VALUE]: 2 },
      },
    });

    expect(facet).toEqual({
      byId: true,
      values: ["key-a", SYSTEM_REQUEST_LOG_FILTER_VALUE],
      names: { "key-a": "Alice" },
      counts: { "key-a": 7, [SYSTEM_REQUEST_LOG_FILTER_VALUE]: 2 },
    });
  });

  test("reads the secret-keyed facet of a backend that predates the capability", () => {
    const facet = readRequestLogKeyFacet({
      capabilities: { apiKeyIdFilters: false, loopGuard: false },
      filters: {
        ...emptyFilters,
        api_keys: ["sk-legacy-secret-0001"],
        api_key_names: { "sk-legacy-secret-0001": "Legacy" },
        api_key_counts: { "sk-legacy-secret-0001": 3 },
      },
    });

    expect(facet.byId).toBe(false);
    expect(facet.values).toEqual(["sk-legacy-secret-0001"]);
  });

  test("treats a response that declares nothing as an older backend", () => {
    const facet = readRequestLogKeyFacet({
      filters: { ...emptyFilters, api_keys: ["sk-legacy-secret-0001"] },
    } as UsageLogsResponse);

    expect(facet.byId).toBe(false);
    expect(facet.values).toEqual(["sk-legacy-secret-0001"]);
  });

  test("an id facet never falls back to the secret-keyed one", () => {
    const facet = readRequestLogKeyFacet({
      capabilities: { apiKeyIdFilters: true, loopGuard: false },
      filters: { ...emptyFilters, api_key_ids: [], api_keys: ["sk-legacy-secret-0001"] },
    });

    expect(facet).toEqual({ byId: true, values: [], names: {}, counts: {} });
  });
});

describe("requestLogKeyFilterQuery", () => {
  test("sends a selection from an id facet as key ids", () => {
    expect(requestLogKeyFilterQuery({ byId: true }, { values: ["key-a"], matchesNone: false })).toEqual(
      { api_key_ids: ["key-a"], api_key_ids_empty: false },
    );
    expect(requestLogKeyFilterQuery({ byId: true }, { matchesNone: true })).toEqual({
      api_key_ids: undefined,
      api_key_ids_empty: true,
    });
  });

  test("keeps sending a selection from a secret-keyed facet as selectors", () => {
    // An older backend ignores api_key_ids and would answer with every key's logs.
    const query = requestLogKeyFilterQuery(
      { byId: false },
      { values: ["sk-legacy-secret-0001"], matchesNone: false },
    );

    expect(query).toEqual({ api_keys: ["sk-legacy-secret-0001"], api_keys_empty: false });
    expect(query).not.toHaveProperty("api_key_ids");
  });

  test("an empty facet that has not been answered yet selects nothing either way", () => {
    expect(
      requestLogKeyFilterQuery(EMPTY_REQUEST_LOG_KEY_FACET, { values: undefined, matchesNone: false }),
    ).toEqual({ api_key_ids: undefined, api_key_ids_empty: false });
  });
});

describe("buildRequestLogKeyOptionsFromFacet", () => {
  test("lists key ids by name, folds system calls into one entry and counts them", () => {
    const options = buildRequestLogKeyOptionsFromFacet(
      {
        byId: true,
        values: ["key-a", "key-b", SYSTEM_REQUEST_LOG_FILTER_VALUE],
        names: { "key-a": "Alice" },
        counts: { "key-a": 7, "key-b": 5, [SYSTEM_REQUEST_LOG_FILTER_VALUE]: 2 },
      },
      labels,
    );

    expect(options.map((option) => [option.value, option.label, option.count])).toEqual([
      ["", "All users", 14],
      ["key-a", "Alice", 7],
      // No name is known for this id: it is called by the start of the id.
      ["key-b", "key-b", 5],
      [SYSTEM_REQUEST_LOG_FILTER_VALUE, "System call", 2],
    ]);
  });

  test("shortens an unnamed id, and finds it by the whole id", () => {
    const id = "3f2a9c1b-7d4e-4a6f-9b21-0c5d8e7a1f34";
    const [, option] = buildRequestLogKeyOptionsFromFacet(
      { byId: true, values: [id], names: {}, counts: { [id]: 1 } },
      labels,
    );

    expect(option?.label).toBe("3f2a9c1b");
    expect(option?.searchText).toContain(id);
    expect(shortRequestLogKeyId(`  ${id} `)).toBe("3f2a9c1b");
  });

  test("never labels a key of a secret-keyed facet by its secret", () => {
    const secret = "sk-unnamed-secret-0001";
    const options = buildRequestLogKeyOptionsFromFacet(
      { byId: false, values: [secret], names: {}, counts: { [secret]: 4 } },
      labels,
    );

    expect(options.map((option) => option.label)).toEqual(["All users", "sk-unn***0001"]);
  });
});

describe("maskRequestLogApiKey", () => {
  // The same table the backend's MaskAPIKey is tested with
  // (internal/usage/api_key_mask_test.go): both sides must agree on the shape.
  // The last row is the one a UTF-16 slice would get wrong: the server counts
  // runes, so a character outside the BMP is one character here too.
  test.each([
    ["very short", "ab", "***"],
    ["four characters", "abcd", "***"],
    ["five characters", "abcde", "ab***de"],
    ["ten characters", "0123456789", "01***89"],
    ["eleven characters", "sk-thinking", "sk-thi***king"],
    ["long key", "sk-owned-log-a", "sk-own***og-a"],
    ["trimmed", "  sk-owned-log-a  ", "sk-own***og-a"],
    ["multi-byte", "密钥一二三四五六七八九十", "密钥一二三四***七八九十"],
    ["astral characters", "🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑", "🔑🔑🔑🔑🔑🔑***🔑🔑🔑🔑"],
  ])("masks %s like the backend does", (_name, value, expected) => {
    expect(maskRequestLogApiKey(value)).toBe(expected);
    // A mask the server stored is shown as it is.
    expect(maskRequestLogApiKey(expected)).toBe(expected);
  });

  test("an empty key has nothing to show", () => {
    expect(maskRequestLogApiKey("   ")).toBe("--");
  });

  test("never keeps the middle of a long key", () => {
    const secret = "sk-abcdefghijklmnopXrstuvwxyz0123456789";
    expect(maskRequestLogApiKey(secret)).not.toContain(secret.slice(10, 30));
  });
});
