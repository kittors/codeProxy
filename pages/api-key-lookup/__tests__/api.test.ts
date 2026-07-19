import { describe, expect, test } from "vitest";
import { normalizePublicModelItem } from "../api";

describe("normalizePublicModelItem", () => {
  test("maps description and pricing fields from /v1/models payload", () => {
    const model = normalizePublicModelItem({
      id: "gpt-5.4",
      owned_by: "openai",
      description: "OpenAI flagship",
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      supports_vision: true,
      pricing: {
        mode: "token",
        input_price_per_million: 2.5,
        output_price_per_million: 10,
        cached_price_per_million: 0.25,
        cache_read_price_per_million: 0.25,
        cache_write_price_per_million: 1.25,
      },
    });

    expect(model).toEqual({
      id: "gpt-5.4",
      description: "OpenAI flagship",
      ownedBy: "openai",
      pricing: {
        mode: "token",
        inputPricePerMillion: 2.5,
        outputPricePerMillion: 10,
        cachedPricePerMillion: 0.25,
        cacheReadPricePerMillion: 0.25,
        cacheWritePricePerMillion: 1.25,
        pricePerCall: 0,
      },
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
      supportsVision: true,
    });
  });

  test("falls back to empty pricing when payload only has id", () => {
    const model = normalizePublicModelItem({ id: "gpt-5.4" });
    expect(model?.id).toBe("gpt-5.4");
    expect(model?.description).toBe("");
    expect(model?.pricing.inputPricePerMillion).toBe(0);
  });
});
