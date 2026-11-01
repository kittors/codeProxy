import { describe, expect, test } from "vitest";
import {
  NO_ROUTING_CONFIG_SUPPORT,
  readRoutingConfigSupport,
  readRoutingVirtualModels,
} from "@code-proxy/api-client/endpoints/routing-config";

describe("readRoutingConfigSupport", () => {
  test("unlocks channel-group exclusions only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({
        "channel-groups": [],
        capabilities: { "channel-group-excluded-models": true },
      }),
    ).toEqual({ ...NO_ROUTING_CONFIG_SUPPORT, channelGroupExcludedModels: true });
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
      ...NO_ROUTING_CONFIG_SUPPORT,
      channelGroupExcludedModels: true,
      channelGroupFollowUpstreamModels: true,
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
      channelGroupFirstTokenTimeout: false,
      channelGroupBusyWait: false,
      channelGroupResetAwareDistribution: false,
      routingSimulation: false,
      virtualModels: false,
    });
  });

  // An older backend keeps neither field: a timeout the operator typed would
  // be dropped on save and never enforced.
  test("unlocks the stream guards one by one, only when the backend says so", () => {
    expect(
      readRoutingConfigSupport({ capabilities: { "channel-group-first-token-timeout": true } }),
    ).toEqual({ ...NO_ROUTING_CONFIG_SUPPORT, channelGroupFirstTokenTimeout: true });
    expect(
      readRoutingConfigSupport({ capabilities: { "channel-group-busy-wait": true } }),
    ).toEqual({ ...NO_ROUTING_CONFIG_SUPPORT, channelGroupBusyWait: true });
    expect(
      readRoutingConfigSupport({
        capabilities: { "channel-group-first-token-timeout": 1, "channel-group-busy-wait": "true" },
      }),
    ).toEqual(NO_ROUTING_CONFIG_SUPPORT);
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

  // An older backend has no /routing-simulation route: the panel would offer a
  // tool that answers 404.
  test("offers the routing simulator only when the backend says so", () => {
    expect(readRoutingConfigSupport({ capabilities: { "routing-simulation": true } })).toEqual({
      ...NO_ROUTING_CONFIG_SUPPORT,
      routingSimulation: true,
    });
    expect(
      readRoutingConfigSupport({ capabilities: { "routing-simulation": "true" } })
        .routingSimulation,
    ).toBe(false);
  });

  // An older backend has no /routing-config/virtual-models route: the panel
  // would offer an editor whose saves answer 404.
  test("offers virtual models only when the backend says so", () => {
    expect(readRoutingConfigSupport({ capabilities: { "virtual-models": true } })).toEqual({
      ...NO_ROUTING_CONFIG_SUPPORT,
      virtualModels: true,
    });
    expect(
      readRoutingConfigSupport({ capabilities: { "virtual-models": "true" } }).virtualModels,
    ).toBe(false);
  });
});

describe("readRoutingVirtualModels", () => {
  test("keeps what the backend stores and drops what is not a virtual model", () => {
    expect(
      readRoutingVirtualModels([
        {
          name: " smart ",
          description: " GPT first ",
          members: [{ group: " team ", model: " gpt-5 ", weight: 0 }, { model: "claude-opus-4" }],
        },
        { name: "fast", strategy: "weighted", members: [{ model: "gpt-5-mini", weight: 2.7 }] },
        // An unknown strategy reads as in order, which is what the backend does with it.
        { name: "odd", strategy: "random", members: [{ model: "" }, "gpt-5", { model: "o3" }] },
        { name: "  ", members: [{ model: "gpt-5" }] },
        "smart",
        null,
      ]),
    ).toEqual([
      {
        name: "smart",
        description: "GPT first",
        members: [{ group: "team", model: "gpt-5" }, { model: "claude-opus-4" }],
      },
      { name: "fast", strategy: "weighted", members: [{ model: "gpt-5-mini", weight: 2 }] },
      { name: "odd", members: [{ model: "o3" }] },
    ]);
    expect(readRoutingVirtualModels(undefined)).toEqual([]);
    expect(readRoutingVirtualModels({ smart: {} })).toEqual([]);
  });
});
