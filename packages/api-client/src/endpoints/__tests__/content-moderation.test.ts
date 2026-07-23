import { beforeEach, describe, expect, test, vi } from "vitest";
import { contentModerationApi } from "../content-moderation";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: mocks,
}));

describe("contentModerationApi", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
  });

  test("uses the profile contract and includes OCC version on patch", async () => {
    mocks.get.mockResolvedValue({ items: [{ id: "profile-1", name: "Primary" }] });
    mocks.patch.mockResolvedValue({ id: "profile-1", version: 4 });

    await expect(contentModerationApi.listProfiles()).resolves.toEqual([
      { id: "profile-1", name: "Primary" },
    ]);
    await contentModerationApi.patchProfile("profile/1", {
      version: 3,
      name: "Updated",
      clear_api_key: true,
    });

    expect(mocks.get).toHaveBeenCalledWith("/content-moderation/profiles");
    expect(mocks.patch).toHaveBeenCalledWith("/content-moderation/profiles/profile%2F1", {
      version: 3,
      name: "Updated",
      clear_api_key: true,
    });
  });

  test("serializes server-side channel picker filters and binding operations", async () => {
    const controller = new AbortController();
    mocks.get.mockResolvedValue({ items: [], page: 2, page_size: 20, total: 0 });
    mocks.patch.mockResolvedValue({ bindings: [] });

    await contentModerationApi.listChannels({
      channel_type: "auth_file",
      query: " codex ",
      tags: [" team-a ", "pro"],
      tag_mode: "all",
      provider: " codex ",
      profile_id: " profile-1 ",
      page: 2,
      page_size: 20,
      signal: controller.signal,
    });
    await contentModerationApi.patchBindings({
      allow_rebind: true,
      operations: [
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          profile_id: "profile-1",
        },
      ],
    });

    expect(mocks.get).toHaveBeenCalledWith("/content-moderation/channels", {
      params: {
        channel_type: "auth_file",
        query: "codex",
        tags: "team-a,pro",
        tag_mode: "all",
        provider: "codex",
        profile_id: "profile-1",
        page: 2,
        page_size: 20,
      },
      signal: controller.signal,
    });
    expect(mocks.patch).toHaveBeenCalledWith("/content-moderation/channel-bindings", {
      allow_rebind: true,
      operations: [
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          profile_id: "profile-1",
        },
      ],
    });
  });
});
