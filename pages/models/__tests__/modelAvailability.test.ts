import { describe, expect, test } from "vitest";
import {
  emptyModelPricing,
  filterByConfiguredModelAvailability,
  normalizeConfiguredModelAvailability,
  type ModelPathAvailabilityItem,
} from "@features/model-availability";
import { mergeConfiguredModelAvailability } from "../modelsUtils";
import type { ModelItem } from "../types";

const baseModel = (id: string, ownedBy = "xai"): ModelItem => ({
  id,
  owned_by: ownedBy,
  description: "",
  enabled: true,
  source: "config",
  pricing: emptyModelPricing(),
  inputModalities: [],
  outputModalities: [],
  supportsVision: false,
});

const pricedModel = (
  id: string,
  inputPricePerMillion: number,
  outputPricePerMillion: number,
): ModelItem => ({
  ...baseModel(id),
  pricing: {
    ...emptyModelPricing(),
    inputPricePerMillion,
    outputPricePerMillion,
  },
});

const pathItem = (id: string, ownedBy: string): ModelPathAvailabilityItem => ({
  id,
  owned_by: ownedBy,
  kind: "path",
  alias: false,
  paths: [],
});

describe("model availability normalization", () => {
  test("preserves an explicit scoped empty availability response", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: true,
      data: [],
    });

    expect(availability.scoped).toBe(true);
    expect(availability.items).toEqual([]);
    expect(filterByConfiguredModelAvailability([{ id: "gpt-5" }], availability)).toEqual([]);
  });

  test("treats an unscoped empty response as unrestricted for older payload shapes", () => {
    const availability = normalizeConfiguredModelAvailability({});

    expect(availability.scoped).toBe(false);
    expect(filterByConfiguredModelAvailability([{ id: "gpt-5" }], availability)).toEqual([
      { id: "gpt-5" },
    ]);
  });

  test("normalizes model source details from configured availability", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: true,
      data: [
        {
          id: "gpt-5",
          sources: [
            {
              label: "codex · Codex Pro",
              provider: "codex",
              channel: "Codex Pro",
              client_id: "codex-1",
            },
          ],
        },
      ],
    });

    expect(availability.items[0]?.sources).toEqual([
      {
        label: "codex · Codex Pro",
        provider: "codex",
        channel: "Codex Pro",
        clientId: "codex-1",
      },
    ]);
  });
});

describe("mergeConfiguredModelAvailability path enrichment", () => {
  test("does not re-add path-only models blocked by scoped AllowedModels", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: true,
      data: [{ id: "grok-4.5", owned_by: "xAI" }],
    });
    const pathItems = [
      pathItem("grok-4.5", "xAI"),
      pathItem("grok-composer-2.5-fast", "xAI"),
    ];

    const merged = mergeConfiguredModelAvailability(
      [baseModel("grok-4.5")],
      availability,
      pathItems,
    );

    expect(merged.map((m) => m.id)).toEqual(["grok-4.5"]);
  });

  test("still merges path-only models when availability is unscoped", () => {
    const availability = normalizeConfiguredModelAvailability({
      scoped: false,
      data: [{ id: "gpt-5", owned_by: "openai" }],
    });
    const pathItems = [
      pathItem("gpt-5", "openai"),
      pathItem("path-only-model", "openai"),
    ];

    const merged = mergeConfiguredModelAvailability(
      [baseModel("gpt-5", "openai")],
      availability,
      pathItems,
    );

    expect(merged.map((m) => m.id).sort()).toEqual(["gpt-5", "path-only-model"]);
  });

  test("inherits base pricing for path-only provider-prefixed models", () => {
    const merged = mergeConfiguredModelAvailability(
      [pricedModel("deepseek-v4-flash", 0.098, 0.196)],
      null,
      [pathItem("ollama/deepseek-v4-flash", "ollama")],
    );

    expect(merged.find((model) => model.id === "ollama/deepseek-v4-flash")?.pricing).toMatchObject({
      inputPricePerMillion: 0.098,
      outputPricePerMillion: 0.196,
    });
  });

  test("inherits base pricing for unpriced variants without overriding exact custom pricing", () => {
    const merged = mergeConfiguredModelAvailability(
      [
        pricedModel("deepseek-v4-flash", 0.098, 0.196),
        baseModel("deepseek-v4-flash:free"),
        pricedModel("deepseek-v4-flash:custom", 3, 12),
      ],
      null,
    );

    expect(merged.find((model) => model.id === "deepseek-v4-flash:free")?.pricing).toMatchObject({
      inputPricePerMillion: 0.098,
      outputPricePerMillion: 0.196,
    });
    expect(merged.find((model) => model.id === "deepseek-v4-flash:custom")?.pricing).toMatchObject({
      inputPricePerMillion: 3,
      outputPricePerMillion: 12,
    });
  });
});
