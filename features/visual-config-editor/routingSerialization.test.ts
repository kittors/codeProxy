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
});
