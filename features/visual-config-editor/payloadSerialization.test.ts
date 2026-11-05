import { describe, expect, test } from "vitest";
import { payloadRulesDraft, serializePayloadRulesForYaml } from "./payloadSerialization";
import type { PayloadFilterRule, PayloadRule } from "./types";

const rule = (id: string, names: string[], params: PayloadRule["params"]): PayloadRule => ({
  id,
  models: names.map((name, i) => ({ id: `${id}-${i}`, name })),
  params,
});

describe("payloadRulesDraft", () => {
  test("drafts the rules the way saving writes them and keeps each one's place on the page", () => {
    const draft = payloadRulesDraft({
      payloadDefaultRules: [
        rule("a", ["  "], [{ id: "1", path: "x", valueType: "string", value: "y" }]),
        rule(
          "b",
          [" gpt-* "],
          [
            { id: "2", path: " max_tokens ", valueType: "number", value: "4096" },
            { id: "3", path: "stream", valueType: "boolean", value: "true" },
            { id: "4", path: "metadata", valueType: "json", value: '{"tier":"gold"}' },
            { id: "5", path: "broken", valueType: "json", value: "{oops" },
            { id: "6", path: " ", valueType: "string", value: "ignored" },
          ],
        ),
      ],
      payloadOverrideRules: [],
      payloadFilterRules: [
        { id: "f", models: [{ id: "f-0", name: "*", protocol: "codex" }], params: [" top_p ", ""] },
      ] satisfies PayloadFilterRule[],
    });

    expect(draft.rules).toEqual({
      default: [
        {
          models: [{ name: "gpt-*" }],
          params: { max_tokens: 4096, stream: true, metadata: { tier: "gold" }, broken: "{oops" },
        },
      ],
      override: [],
      filter: [{ models: [{ name: "*", protocol: "codex" }], params: ["top_p"] }],
    });
    // The rule without a model is not drafted, so the drafted rule is the page's second.
    expect(draft.formIndexes).toEqual({ default: [1], override: [], filter: [0] });
    expect(draft.rules.default).toEqual(
      serializePayloadRulesForYaml([
        rule("a", ["  "], []),
        rule(
          "b",
          [" gpt-* "],
          [
            { id: "2", path: " max_tokens ", valueType: "number", value: "4096" },
            { id: "3", path: "stream", valueType: "boolean", value: "true" },
            { id: "4", path: "metadata", valueType: "json", value: '{"tier":"gold"}' },
            { id: "5", path: "broken", valueType: "json", value: "{oops" },
          ],
        ),
      ]),
    );
  });
});
