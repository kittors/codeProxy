import { describe, expect, it } from "vitest";
import { parseRoutingChannelGroups, serializeRoutingChannelGroupsForYaml } from "./routingSerialization";

describe("routing scheduling weight round-trip", () => {
  const roundTrip = (fields: Record<string, unknown>) =>
    serializeRoutingChannelGroupsForYaml(parseRoutingChannelGroups([
      { name: "group", match: { channels: ["A", "B"] }, ...fields },
    ]))[0];

  it("preserves explicit exclusion and positive weights from scheduling alone", () => {
    const result = roundTrip({
      scheduling: { distribution: "weighted", "channel-weights": { A: 0, B: 4 } },
    });
    expect(result).toMatchObject({
      scheduling: { distribution: "weighted", "channel-weights": { A: 0, B: 4 } },
      "channel-priorities": { A: 0, B: 4 },
    });
  });

  it("prefers scheduling weights over conflicting legacy priorities", () => {
    const result = roundTrip({
      scheduling: { distribution: "weighted", "channel-weights": { A: 0, B: 4 } },
      "channel-priorities": { A: 9, B: 1 },
    });
    expect(result?.["channel-priorities"]).toEqual({ A: 0, B: 4 });
  });

  it("retains legacy priorities when scheduling has no weight map", () => {
    const result = roundTrip({
      scheduling: { distribution: "least-load" },
      "channel-priorities": { A: 0, B: 4 },
    });
    expect(result).toMatchObject({
      scheduling: { distribution: "least-load", "channel-weights": { A: 0, B: 4 } },
      "channel-priorities": { A: 0, B: 4 },
    });
  });

  it("keeps missing weights unset rather than converting them to exclusion", () => {
    const result = roundTrip({ scheduling: { distribution: "weighted", "channel-weights": { A: 0 } } });
    expect(result?.["channel-priorities"]).toEqual({ A: 0 });
    const unweighted = roundTrip({ scheduling: { distribution: "weighted" } });
    expect(unweighted).not.toHaveProperty("channel-priorities");
    expect(unweighted?.scheduling).not.toHaveProperty("channel-weights");
  });

  it("honours an explicit empty new map instead of reviving legacy weights", () => {
    const result = roundTrip({
      scheduling: { distribution: "weighted", "channel-weights": {} },
      "channel-priorities": { A: 0, B: 4 },
    });
    expect(result).not.toHaveProperty("channel-priorities");
    expect(result?.scheduling).not.toHaveProperty("channel-weights");
  });

  it("retains channels mentioned only in the authoritative weight map", () => {
    const result = roundTrip({
      match: { channels: ["A"] },
      scheduling: { distribution: "weighted", "channel-weights": { B: 4 } },
    });
    expect(result?.match).toEqual({ channels: ["A", "B"] });
    expect(result?.["channel-priorities"]).toEqual({ B: 4 });
  });

  it("round-trips the exclusion list that keeps new upstream models allowed", () => {
    const result = roundTrip({ "excluded-models": ["grok-imagine-video-1.5", " ", "grok-4.5"] });
    expect(result?.["excluded-models"]).toEqual(["grok-imagine-video-1.5", "grok-4.5"]);
    expect(result).not.toHaveProperty("allowed-models");
  });

  it("round-trips a frozen allow list without inventing exclusions", () => {
    const result = roundTrip({ "allowed-models": ["grok-4.5"] });
    expect(result?.["allowed-models"]).toEqual(["grok-4.5"]);
    expect(result).not.toHaveProperty("excluded-models");
  });

  // The backend serves "the allow list minus the exclusions" for such a group,
  // so writing back only one half would change what it serves.
  it("round-trips a group that carries both lists", () => {
    const result = roundTrip({
      "allowed-models": ["grok-4.5", "grok-4.6"],
      "excluded-models": ["grok-4.6", "grok-imagine-*"],
    });
    expect(result?.["allowed-models"]).toEqual(["grok-4.5", "grok-4.6"]);
    expect(result?.["excluded-models"]).toEqual(["grok-4.6", "grok-imagine-*"]);
  });

  // Only a setting that was read (or set) is written: leaving it out resets a
  // following group, and writing it for every group would freeze each unset one
  // at today's default.
  it("writes follow-upstream-models back exactly as read", () => {
    expect(roundTrip({ "allowed-models": ["gpt-6.1-sol"], "follow-upstream-models": true })).toMatchObject({
      "follow-upstream-models": true,
    });
    expect(roundTrip({ name: "default", "follow-upstream-models": false })).toMatchObject({
      "follow-upstream-models": false,
    });
    expect(roundTrip({ "allowed-models": ["gpt-6.1-sol"] })).not.toHaveProperty("follow-upstream-models");
  });
});

describe("channel-group stream guards round-trip", () => {
  const roundTrip = (fields: Record<string, unknown>) =>
    serializeRoutingChannelGroupsForYaml(
      parseRoutingChannelGroups([{ name: "group", match: { channels: ["A"] }, ...fields }]),
    )[0];

  // Routing is saved whole: a key the panel drops is a setting it resets.
  it("writes both back exactly as stored", () => {
    expect(
      roundTrip({ "first-token-timeout-seconds": 30, "busy-wait-max-seconds": 120 }),
    ).toMatchObject({ "first-token-timeout-seconds": 30, "busy-wait-max-seconds": 120 });
  });

  // Both are off, but a stored 0 is an explicit choice and must not turn into unset.
  it("keeps a busy wait of 0 apart from an unset one", () => {
    expect(roundTrip({ "busy-wait-max-seconds": 0 })).toMatchObject({ "busy-wait-max-seconds": 0 });
    expect(roundTrip({})).not.toHaveProperty("busy-wait-max-seconds");
  });

  it("leaves out what was never set, and an off timeout", () => {
    const result = roundTrip({ "first-token-timeout-seconds": 0 });
    expect(result).not.toHaveProperty("first-token-timeout-seconds");
    expect(result).not.toHaveProperty("busy-wait-max-seconds");
  });

  it("ignores values that are not whole seconds", () => {
    const result = roundTrip({ "first-token-timeout-seconds": "30", "busy-wait-max-seconds": -1 });
    expect(result).not.toHaveProperty("first-token-timeout-seconds");
    expect(result).not.toHaveProperty("busy-wait-max-seconds");
  });
});
