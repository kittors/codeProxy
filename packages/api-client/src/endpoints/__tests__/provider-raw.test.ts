import { describe, expect, test } from "vitest";
import {
  carryRawRecord,
  mergeUnmodeledRecord,
  readRawRecord,
  unmodeledFields,
  withRawRecord,
  type NestedListSpec,
} from "../provider-raw";

const OWNED = ["api-key", "base-url", "excluded-models", "models"] as const;

describe("provider raw record helpers", () => {
  test("only objects with a record behind them carry one", () => {
    for (const source of [undefined, null, "text", 3, ["a"]]) {
      expect(readRawRecord(withRawRecord(source, {}))).toBeUndefined();
    }
    expect(readRawRecord(withRawRecord({ priority: 1 }, {}))).toEqual({ priority: 1 });
    expect(readRawRecord(undefined)).toBeUndefined();
    expect(readRawRecord("text")).toBeUndefined();
  });

  test("unmodeledFields drops the owned keys in both spellings", () => {
    expect(
      unmodeledFields(
        {
          "api-key": "k",
          apiKey: "k",
          baseUrl: "https://x",
          excludedModels: ["a"],
          priority: 2,
          cloak: { mode: "always" },
        },
        OWNED,
      ),
    ).toEqual({ priority: 2, cloak: { mode: "always" } });
  });

  test("without a record the payload comes back untouched", () => {
    const payload = { "api-key": "k" };
    expect(mergeUnmodeledRecord(payload, { apiKey: "k" }, OWNED)).toBe(payload);
  });

  test("modeled fields win over the record, and owned keys are never revived", () => {
    const source = withRawRecord(
      { "api-key": "old", "base-url": "https://old", priority: 5, cloak: { mode: "always" } },
      {},
    );

    expect(mergeUnmodeledRecord({ "api-key": "new" }, source, OWNED)).toEqual({
      "api-key": "new",
      priority: 5,
      cloak: { mode: "always" },
    });
  });

  test("a key missing from the owned list loses to the modeled value rather than the other way round", () => {
    const source = withRawRecord({ prefix: "from the record" }, {});

    expect(mergeUnmodeledRecord({ prefix: "typed by the user" }, source, [])).toEqual({
      prefix: "typed by the user",
    });
  });

  test("merged fields are copies of the record's", () => {
    const source = withRawRecord({ cloak: { mode: "always" } }, {});

    const merged = mergeUnmodeledRecord({}, source, OWNED) as { cloak: { mode: string } };
    merged.cloak.mode = "tampered";

    expect(readRawRecord(source)).toEqual({ cloak: { mode: "always" } });
  });

  test("a record's list is only consulted when the payload writes that list", () => {
    const nested: NestedListSpec[] = [
      { key: "models", owned: ["name"], identities: [(record) => String(record.name ?? "")] },
    ];
    const source = withRawRecord({ models: [{ name: "a", extra: 1 }] }, {});

    expect(mergeUnmodeledRecord({ "api-key": "k" }, source, ["api-key", "models"], nested)).toEqual(
      {
        "api-key": "k",
      },
    );
    expect(
      mergeUnmodeledRecord({ models: [{ name: "a" }, { name: "b" }] }, source, ["models"], nested),
    ).toEqual({ models: [{ name: "a", extra: 1 }, { name: "b" }] });
    // 记录里的 models 不是数组（异常响应）时，按没有处理。
    expect(
      mergeUnmodeledRecord(
        { models: [{ name: "a" }] },
        withRawRecord({ models: "oops" }, {}),
        ["models"],
        nested,
      ),
    ).toEqual({ models: [{ name: "a" }] });
  });

  test("each record in a list is matched once", () => {
    const nested: NestedListSpec[] = [
      { key: "models", owned: ["name"], identities: [(record) => String(record.name ?? "")] },
    ];
    const source = withRawRecord({ models: [{ name: "a", extra: "first" }] }, {});

    expect(
      mergeUnmodeledRecord({ models: [{ name: "a" }, { name: "a" }] }, source, ["models"], nested),
    ).toEqual({ models: [{ name: "a", extra: "first" }, { name: "a" }] });
  });

  test("carrying shares the same record without exposing it", () => {
    const source = withRawRecord({ priority: 1 }, { apiKey: "k" });
    const next = carryRawRecord({ apiKey: "k2" }, source);

    expect(readRawRecord(next)).toBe(readRawRecord(source));
    expect(Object.keys(next)).toEqual(["apiKey"]);
  });
});
