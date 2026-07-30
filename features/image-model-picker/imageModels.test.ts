import { describe, expect, test } from "vitest";
import type { ImageGenerationChannelsResponse } from "@code-proxy/api-client";
import {
  buildImageModelCatalog,
  findImageModel,
  providerLabel,
  resolveInitialModel,
  resolveInitialProvider,
  supportsImageEditing,
} from "./imageModels";

const response: ImageGenerationChannelsResponse = {
  model: "gpt-image-2",
  channels: ["codex-a", "grok-a"],
  providers: [
    { provider: "codex", channels: ["codex-a"], models: ["gpt-image-2"] },
    { provider: "xai", channels: ["grok-a"], models: ["grok-imagine-image", "grok-2-image-1212"] },
  ],
  models: [
    { id: "gpt-image-2", provider: "codex", supports_edit: true, display_name: "GPT Image 2" },
    { id: "grok-imagine-image", provider: "xai", supports_edit: true },
    { id: "grok-2-image-1212", provider: "xai", supports_edit: false },
  ],
};

describe("buildImageModelCatalog", () => {
  test("groups models under the provider that serves them", () => {
    const catalog = buildImageModelCatalog(response);

    expect(catalog.legacy).toBe(false);
    expect(catalog.providers.map((entry) => entry.provider)).toEqual(["codex", "xai"]);
    expect(catalog.providers[1].models.map((model) => model.id)).toEqual([
      "grok-imagine-image",
      "grok-2-image-1212",
    ]);
  });

  /**
   * A provider with no usable channel cannot serve a request, so offering its
   * models would only produce a confusing failure at submit time.
   */
  test("drops providers that have no usable channel", () => {
    const catalog = buildImageModelCatalog({
      ...response,
      providers: [
        { provider: "codex", channels: [], models: ["gpt-image-2"] },
        { provider: "xai", channels: ["grok-a"], models: ["grok-imagine-image"] },
      ],
    });

    expect(catalog.providers.map((entry) => entry.provider)).toEqual(["xai"]);
    expect(findImageModel(catalog, "gpt-image-2")).toBeNull();
  });

  /**
   * The panel and the backend deploy independently, so a server that only sends
   * the old single-model shape has to keep producing a usable page.
   */
  test("falls back to a single-provider catalog on the legacy response shape", () => {
    const catalog = buildImageModelCatalog({ model: "gpt-image-2", channels: ["codex-a"] });

    expect(catalog.legacy).toBe(true);
    expect(catalog.models.map((model) => model.id)).toEqual(["gpt-image-2"]);
    // The legacy shape names no provider, and guessing "codex" would start lying
    // the moment another provider is added server-side.
    expect(catalog.models[0].provider).toBe("");
  });

  test("returns an empty catalog when nothing is configured", () => {
    expect(buildImageModelCatalog(null).models).toEqual([]);
    expect(buildImageModelCatalog({ model: "", channels: [] }).models).toEqual([]);
  });
});

describe("selection", () => {
  const catalog = buildImageModelCatalog(response);

  test("prefers a previously used provider and model", () => {
    expect(resolveInitialProvider(catalog, "xai")).toBe("xai");
    expect(resolveInitialModel(catalog, "xai", "grok-2-image-1212")).toBe("grok-2-image-1212");
  });

  test("falls back to the first entry when the preference is unavailable", () => {
    expect(resolveInitialProvider(catalog, "deleted-provider")).toBe("codex");
    expect(resolveInitialModel(catalog, "xai", "gpt-image-2")).toBe("grok-imagine-image");
  });

  test("returns empty selections for an empty catalog", () => {
    const empty = buildImageModelCatalog(null);
    expect(resolveInitialProvider(empty, null)).toBe("");
    expect(resolveInitialModel(empty, "", null)).toBe("");
  });
});

describe("supportsImageEditing", () => {
  const catalog = buildImageModelCatalog(response);

  /**
   * Driven by the server's declared capability rather than the model id: offering
   * an edit form for a text-to-image-only model produces an upstream 404 instead
   * of a useful error.
   */
  test("reflects the capability the server declared", () => {
    expect(supportsImageEditing(catalog, "grok-imagine-image")).toBe(true);
    expect(supportsImageEditing(catalog, "grok-2-image-1212")).toBe(false);
  });

  test("is false for a model that is not in the catalog", () => {
    expect(supportsImageEditing(catalog, "not-a-model")).toBe(false);
  });
});

describe("providerLabel", () => {
  test("maps known providers to display names", () => {
    expect(providerLabel("xai")).toBe("Grok");
    expect(providerLabel("codex")).toBe("Codex");
  });

  /** An unknown provider stays usable rather than rendering as blank. */
  test("falls back to the raw id for an unknown provider", () => {
    expect(providerLabel("some-new-provider")).toBe("some-new-provider");
  });
});
