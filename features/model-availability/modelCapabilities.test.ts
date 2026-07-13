import { describe, expect, test } from "vitest";
import {
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
