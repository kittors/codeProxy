import { describe, expect, test } from "vitest";
import { readRoutingConfigSupport } from "@code-proxy/api-client/endpoints/routing-config";

describe("readRoutingConfigSupport", () => {
  test("unlocks channel-group exclusions only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({
        "channel-groups": [],
        capabilities: { "channel-group-excluded-models": true },
      }),
    ).toEqual({ channelGroupExcludedModels: true });
  });

  // A backend that predates the field drops `excluded-models` on PUT without an
  // error, so anything short of an explicit `true` has to read as unsupported.
  test.each<[string, unknown]>([
    ["a backend without capabilities", { "channel-groups": [] }],
    ["an explicit false", { capabilities: { "channel-group-excluded-models": false } }],
    ["a truthy non-boolean", { capabilities: { "channel-group-excluded-models": "true" } }],
    ["a capabilities array", { capabilities: ["channel-group-excluded-models"] }],
    ["an empty response", undefined],
    ["a non-object response", "ok"],
  ])("treats %s as unsupported", (_name, payload) => {
    expect(readRoutingConfigSupport(payload)).toEqual({ channelGroupExcludedModels: false });
  });
});
