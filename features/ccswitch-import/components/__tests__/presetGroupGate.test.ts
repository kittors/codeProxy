import { describe, expect, test } from "vitest";
import { createCcSwitchImportConfig } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { presetModelsRefusedByGroup } from "../presetGroupGate";
import type { CcSwitchChannelGroupOption } from "../useChannelGroupModels";

// The "gpt pro 号池" preset of the 2026-10-28 report: Codex, default model
// gpt-5.4, routed to a group whose allow list never had gpt-5.4 in it.
const preset = () =>
  createCcSwitchImportConfig({
    clientType: "codex",
    defaultModel: "gpt-5.4",
    allowedChannelGroups: ["deepseekv4flash+chatgpt"],
    modelMappings: [
      { requestModel: "gpt-5.4", targetModel: "gpt-5.4" },
      { requestModel: "gpt-6.1-sol", targetModel: "gpt-6.1-sol" },
      { requestModel: "fast", targetModel: "gpt-6-sol" },
    ],
  });

const group = (patch: Partial<CcSwitchChannelGroupOption>): CcSwitchChannelGroupOption => ({
  value: "deepseekv4flash+chatgpt",
  label: "deepseekv4flash+chatgpt",
  allowedModels: ["gpt-6.1-sol", "gpt-6-sol"],
  ...patch,
});

describe("presetModelsRefusedByGroup", () => {
  test("names the targets the group's allow list leaves out", () => {
    expect(presetModelsRefusedByGroup(preset(), group({}))).toEqual(["gpt-5.4"]);
  });

  test("counts what discovery admits only while the group follows upstream", () => {
    const listed = { discoveredModels: ["gpt-5.4"] };
    expect(presetModelsRefusedByGroup(preset(), group(listed))).toEqual(["gpt-5.4"]);
    expect(
      presetModelsRefusedByGroup(preset(), group({ ...listed, followUpstreamModels: true })),
    ).toEqual([]);
  });

  test("an exclusion refuses a target the allow list or discovery would admit", () => {
    expect(
      presetModelsRefusedByGroup(
        preset(),
        group({ allowedModels: [], excludedModels: ["gpt-6-*"] }),
      ),
    ).toEqual(["gpt-6-sol"]);
  });

  test("reports nothing without the group's settings to check against", () => {
    expect(presetModelsRefusedByGroup(preset(), undefined)).toEqual([]);
  });
});
