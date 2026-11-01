import { beforeEach, describe, expect, test, vi } from "vitest";
import { contentModerationApi } from "../content-moderation";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
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
    mocks.put.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
  });

  test("loads process-local moderation metrics", async () => {
    const metrics = {
      requests: 12,
      allows: 9,
      blocks: 2,
      errors: 1,
      cache_hits: 3,
      in_flight: 1,
      latency_total_ms: 180,
      latency_samples: 10,
      avg_latency_ms: 18,
    };
    mocks.get.mockResolvedValue(metrics);

    await expect(contentModerationApi.getMetrics()).resolves.toEqual(metrics);

    expect(mocks.get).toHaveBeenCalledWith("/content-moderation/metrics");
  });

  test("uses the profile contract and includes OCC version on patch", async () => {
    mocks.get.mockResolvedValue({ items: [{ id: "profile-1", name: "Primary" }] });
    mocks.patch.mockResolvedValue({ id: "profile-1", version: 4 });

    // A backend that declares nothing offers none of the later fields.
    await expect(contentModerationApi.listProfiles()).resolves.toEqual({
      items: [{ id: "profile-1", name: "Primary" }],
      capabilities: {
        keywordFoldTraditionalChinese: false,
        apiIncludesToolOutput: false,
        wordGuard: false,
        secretMasking: false,
      },
    });
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

  test("reads the profile fields the backend declares it stores", async () => {
    mocks.get
      .mockResolvedValueOnce({
        items: null,
        capabilities: {
          keyword_fold_traditional_chinese: true,
          api_includes_tool_output: true,
          word_guard: true,
          secret_masking: true,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        // Only an explicit true counts as a declaration.
        capabilities: {
          keyword_fold_traditional_chinese: "yes",
          api_includes_tool_output: true,
          word_guard: "true",
          secret_masking: 1,
        },
      });

    await expect(contentModerationApi.listProfiles()).resolves.toEqual({
      items: [],
      capabilities: {
        keywordFoldTraditionalChinese: true,
        apiIncludesToolOutput: true,
        wordGuard: true,
        secretMasking: true,
      },
    });
    await expect(contentModerationApi.listProfiles()).resolves.toEqual({
      items: [],
      capabilities: {
        keywordFoldTraditionalChinese: false,
        apiIncludesToolOutput: true,
        wordGuard: false,
        secretMasking: false,
      },
    });
  });

  test("reads and writes the secret masking switch", async () => {
    mocks.get.mockResolvedValue({ enabled: false, persistent: true });
    mocks.put.mockResolvedValue({ enabled: true, persistent: true });

    await expect(contentModerationApi.getSecretMasking()).resolves.toEqual({
      enabled: false,
      persistent: true,
    });
    expect(mocks.get).toHaveBeenCalledWith("/content-moderation/secret-masking");
    await expect(contentModerationApi.setSecretMasking(true)).resolves.toEqual({
      enabled: true,
      persistent: true,
    });
    expect(mocks.put).toHaveBeenCalledWith("/content-moderation/secret-masking", {
      enabled: true,
    });
  });

  test("normalizes nullable channel list fields", async () => {
    mocks.get
      .mockResolvedValueOnce({ items: null, page: 1, page_size: 20, total: 0 })
      .mockResolvedValueOnce({
        items: [
          {
            channel_type: "auth_file",
            channel_id: "auth-1",
            name: "Codex Team",
            provider: "codex",
            tags: null,
            disabled: false,
          },
        ],
        page: 1,
        page_size: 20,
        total: 1,
      });

    await expect(contentModerationApi.listChannels()).resolves.toEqual({
      items: [],
      page: 1,
      page_size: 20,
      total: 0,
    });
    await expect(contentModerationApi.listChannels()).resolves.toEqual({
      items: [
        {
          channel_type: "auth_file",
          channel_id: "auth-1",
          name: "Codex Team",
          provider: "codex",
          tags: [],
          disabled: false,
        },
      ],
      page: 1,
      page_size: 20,
      total: 1,
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
