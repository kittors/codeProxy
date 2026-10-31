import { describe, expect, test } from "vitest";
import { readRoutingConfigSupport } from "@code-proxy/api-client/endpoints/routing-config";

describe("readRoutingConfigSupport", () => {
  test("unlocks channel-group exclusions only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({
        "channel-groups": [],
        capabilities: { "channel-group-excluded-models": true },
      }),
    ).toEqual({
      channelGroupExcludedModels: true,
      channelGroupFollowUpstreamModels: false,
      channelGroupResetAwareDistribution: false,
    });
  });

  // An older backend drops `follow-upstream-models` on PUT, which would reset a
  // group the operator just switched to follow upstream.
  test("unlocks following upstream only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({
        capabilities: {
          "channel-group-excluded-models": true,
          "channel-group-follow-upstream-models": true,
        },
      }),
    ).toEqual({
      channelGroupExcludedModels: true,
      channelGroupFollowUpstreamModels: true,
      channelGroupResetAwareDistribution: false,
    });
    expect(
      readRoutingConfigSupport({
        capabilities: { "channel-group-follow-upstream-models": "true" },
      }).channelGroupFollowUpstreamModels,
    ).toBe(false);
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
    expect(readRoutingConfigSupport(payload)).toEqual({
      channelGroupExcludedModels: false,
      channelGroupFollowUpstreamModels: false,
      channelGroupResetAwareDistribution: false,
    });
  });

  // An older backend reads an unknown distribution as weighted, so saving
  // reset-aware there would quietly switch the group to weighted.
  test("offers the reset-aware distribution only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({ capabilities: { "channel-group-distribution-reset-aware": true } })
        .channelGroupResetAwareDistribution,
    ).toBe(true);
    expect(
      readRoutingConfigSupport({ capabilities: { "channel-group-distribution-reset-aware": "true" } })
        .channelGroupResetAwareDistribution,
    ).toBe(false);
  });
});
