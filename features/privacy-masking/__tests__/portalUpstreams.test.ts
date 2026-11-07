import { describe, expect, test } from "vitest";
import type { MaskRecord, MaskSummary } from "@code-proxy/api-client";
import { recordByUpstream, summaryByUpstream, upstreamOf } from "../portalUpstreams";

const summary = (channels: MaskSummary["channels"]): MaskSummary => ({
  days: [],
  places: 0,
  distinct: 0,
  requests: 0,
  blocked: 0,
  warned: 0,
  kinds: [],
  clients: [],
  channels,
  values: [],
});

describe("upstreams instead of channels in the portal", () => {
  test("merges channels by their upstream, and never shows a name it does not know", () => {
    const merged = summaryByUpstream(
      summary([
        { name: "alice@example.com", places: 10, requests: 2, vendor: "codex" },
        { name: "Codex pool", places: 5, requests: 1, vendor: "openai" },
        { name: "Claude official", places: 3, requests: 1, vendor: "claude" },
        // OpenAI 兼容渠道的 provider 是运营方起的名字
        { name: "tudou-relay", places: 2, requests: 1, vendor: "tudou-relay" },
        { name: "no vendor", places: 1, requests: 1 },
      ]),
      "Other",
    );
    expect(merged.channels).toEqual([
      { name: "OpenAI", places: 15, requests: 3, vendor: "openai" },
      { name: "Claude", places: 3, requests: 1, vendor: "claude" },
      { name: "Other", places: 3, requests: 2, vendor: undefined },
    ]);
    expect(upstreamOf(" Gemini-CLI ", "Other")).toEqual({ label: "Gemini", vendor: "gemini" });
  });

  test("a record held back keeps its empty channel, one sent shows its upstream", () => {
    const base = {
      key: "k",
      at: "",
      client: "codex",
      places: 1,
      distinct: 1,
      values: [],
    } satisfies Partial<MaskRecord>;
    expect(recordByUpstream({ ...base, channel: "", provider: "" }, "Other")).toMatchObject({
      channel: "",
      provider: "",
    });
    expect(
      recordByUpstream({ ...base, channel: "alice@example.com", provider: "kimi" }, "Other"),
    ).toMatchObject({
      channel: "Kimi",
      provider: "kimi",
    });
    expect(
      recordByUpstream({ ...base, channel: "my-relay", provider: "my-relay" }, "Other"),
    ).toMatchObject({
      channel: "Other",
      provider: undefined,
    });
  });
});
