import { beforeEach, describe, expect, test, vi } from "vitest";
import { channelGroupsApi } from "@code-proxy/api-client/endpoints/channel-groups";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
  },
}));

describe("channelGroupsApi.list", () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  // CC Switch builds its model picker from this list. Dropping the exclusions
  // offered models the group refuses, and the saved mapping then got a 403.
  test("keeps a group's excluded models next to its allow list", async () => {
    mocks.get.mockResolvedValue({
      items: [
        {
          name: "xai-pool",
          "allowed-models": ["grok-4.6"],
          "excluded-models": [" grok-imagine-* ", "grok-imagine-*", "", "xai/grok-4.7"],
        },
        { name: "open" },
      ],
    });

    const items = await channelGroupsApi.list();

    expect(items[0]).toMatchObject({
      name: "xai-pool",
      "allowed-models": ["grok-4.6"],
      "excluded-models": ["grok-imagine-*", "xai/grok-4.7"],
    });
    expect(items[1]["excluded-models"]).toEqual([]);
  });
});
