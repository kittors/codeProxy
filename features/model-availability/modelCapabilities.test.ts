import { describe, expect, test } from "vitest";
import {
  modelConfigLookupIds,
  modelHasTextCapability,
  resolveModelCapabilities,
} from "./modelCapabilities";

describe("resolveModelCapabilities", () => {
  test("defaults empty metadata chat models to text only", () => {
    expect(resolveModelCapabilities({ id: "gpt-5.4" })).toEqual(["text"]);
  });

  test("marks vision from input modalities or supportsVision", () => {
    expect(
      resolveModelCapabilities({
        id: "claude-sonnet-4",
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
      }),
    ).toEqual(["text", "vision"]);

    expect(
      resolveModelCapabilities({
        id: "qwen-vl",
        supportsVision: true,
        inputModalities: ["text"],
        outputModalities: ["text"],
      }),
    ).toEqual(["text", "vision"]);
  });

  test("treats image keyword / image output as image generation without text", () => {
    // Prompt input "text" is not chat capability for pure image generators.
    expect(
      resolveModelCapabilities({
        id: "gpt-image-2",
        inputModalities: ["text"],
        outputModalities: ["image"],
      }),
    ).toEqual(["image"]);

    expect(
      resolveModelCapabilities({
        id: "black-forest-labs/flux-image",
      }),
    ).toEqual(["image"]);

    expect(
      modelHasTextCapability({
        id: "gpt-image-2",
        inputModalities: ["text"],
        outputModalities: ["image"],
      }),
    ).toBe(false);
  });

  test("treats video keyword / video output as video without text", () => {
    expect(
      resolveModelCapabilities({
        id: "openai/sora-2-video",
      }),
    ).toEqual(["video"]);

    expect(
      resolveModelCapabilities({
        id: "kling-v1",
        outputModalities: ["video"],
      }),
    ).toEqual(["video"]);
  });

  test("supports multi-capability models including audio", () => {
    expect(
      resolveModelCapabilities({
        id: "gpt-4o-realtime",
        inputModalities: ["text", "audio", "image"],
        outputModalities: ["text", "audio"],
        supportsVision: true,
      }),
    ).toEqual(["text", "vision", "audio"]);
  });

  test("keeps explicit text when generator modalities include text", () => {
    expect(
      resolveModelCapabilities({
        id: "multi-image-tool",
        inputModalities: ["text"],
        outputModalities: ["text", "image"],
      }),
    ).toEqual(["text", "image"]);
  });
});

describe("modelConfigLookupIds", () => {
  test("returns exact id for simple model", () => {
    expect(modelConfigLookupIds("gpt-4o")).toEqual(["gpt-4o", "4o", "gpt"]);
  });

  test("strips provider prefix", () => {
    const ids = modelConfigLookupIds("ollama/deepseek-v4-flash");
    expect(ids).toContain("ollama/deepseek-v4-flash");
    expect(ids).toContain("deepseek-v4-flash");
  });

  test("strips variant suffix after colon", () => {
    const ids = modelConfigLookupIds("deepseek-v4-flash:free");
    expect(ids).toContain("deepseek-v4-flash:free");
    expect(ids).toContain("deepseek-v4-flash");
  });

  test("strips last dash-segment for thinking suffix", () => {
    const ids = modelConfigLookupIds("claude-opus-4-6-thinking");
    expect(ids).toContain("claude-opus-4-6");
  });

  test("strips last dash-segment for agent suffix", () => {
    const ids = modelConfigLookupIds("some-model-agent");
    expect(ids).toContain("some-model");
  });

  test("strips last dash-segment for tier suffixes", () => {
    for (const suffix of ["high", "low", "medium", "tiered"]) {
      const ids = modelConfigLookupIds(`gemini-2.5-flash-${suffix}`);
      expect(ids).toContain("gemini-2.5-flash");
    }
  });

  test("strips last dash-segment from providerless id for provider-prefixed models", () => {
    const ids = modelConfigLookupIds("ollama/gemini-2.5-flash-thinking");
    expect(ids).toContain("gemini-2.5-flash");
  });

  test("extra-low strips to extra then to base via last-dash", () => {
    const ids = modelConfigLookupIds("some-model-extra-low");
    // last dash strip produces "some-model-extra"
    expect(ids).toContain("some-model-extra");
  });
});
