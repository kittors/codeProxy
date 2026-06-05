import { describe, expect, test } from "vitest";
import { summarizeProviderAccess } from "@pages/providers/provider-access";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import type { ChannelGroupItem } from "@code-proxy/api-client/endpoints/channel-groups";

describe("summarizeProviderAccess", () => {
  const groups: ChannelGroupItem[] = [
    {
      name: "kimi-pool",
      channels: ["Kimi渠道", "kimi渠道 2"],
    },
  ];

  test("treats direct channels and channel groups as the current routing intersection", () => {
    const entries: ApiKeyEntry[] = [
      {
        key: "sk-open",
      },
      {
        key: "sk-group",
        "allowed-channel-groups": ["kimi-pool"],
      },
      {
        key: "sk-direct-first",
        "allowed-channels": ["Kimi渠道"],
      },
      {
        key: "sk-direct-second",
        "allowed-channels": ["kimi渠道 2"],
      },
      {
        key: "sk-disabled",
        disabled: true,
      },
    ];

    expect(summarizeProviderAccess("Kimi渠道", entries, groups)).toEqual({
      reachableKeys: 3,
      totalKeys: 4,
      exactOverrideKeys: 2,
    });

    expect(summarizeProviderAccess("kimi渠道 2", entries, groups)).toEqual({
      reachableKeys: 3,
      totalKeys: 4,
      exactOverrideKeys: 2,
    });
  });

  test("reports hidden exact-channel locks that exclude sibling channels", () => {
    const entries: ApiKeyEntry[] = [
      {
        key: "sk-kimi-only",
        "allowed-channels": ["Kimi渠道"],
      },
    ];

    expect(summarizeProviderAccess("kimi渠道 2", entries, groups)).toEqual({
      reachableKeys: 0,
      totalKeys: 1,
      exactOverrideKeys: 1,
    });
  });
});
