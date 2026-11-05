import { beforeEach, describe, expect, test, vi } from "vitest";

const postMock = vi.fn();

vi.mock("../../client/client", () => ({
  apiClient: { post: postMock },
}));

describe("authFilesApi.clearModelCooldown", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  test("posts the account and the one model to clear", async () => {
    const { authFilesApi } = await import("@code-proxy/api-client/endpoints/auth-files");
    postMock.mockResolvedValue({ status: "ok", changed: true });

    const result = await authFilesApi.clearModelCooldown({
      authIndex: "auth-7",
      model: "gpt-5.5",
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith("/auth-files/model-cooldown/clear", {
      auth_index: "auth-7",
      model: "gpt-5.5",
    });
    expect(result).toEqual({ changed: true });
  });

  test("reports changed=false when the model had nothing to clear", async () => {
    const { authFilesApi } = await import("@code-proxy/api-client/endpoints/auth-files");
    postMock.mockResolvedValue({ status: "ok", changed: false });

    await expect(
      authFilesApi.clearModelCooldown({ authIndex: "auth-7", model: "gpt-5.5" }),
    ).resolves.toEqual({ changed: false });
  });

  test.each([
    ["an empty body", undefined],
    ["a body without the flag", { status: "ok" }],
    ["a flag that is not a boolean", { status: "ok", changed: "true" }],
  ])("does not claim a change for %s", async (_label, body) => {
    const { authFilesApi } = await import("@code-proxy/api-client/endpoints/auth-files");
    postMock.mockResolvedValue(body);

    await expect(
      authFilesApi.clearModelCooldown({ authIndex: "auth-7", model: "gpt-5.5" }),
    ).resolves.toEqual({ changed: false });
  });

  test("lets a failure reach the caller instead of swallowing it", async () => {
    const { authFilesApi } = await import("@code-proxy/api-client/endpoints/auth-files");
    postMock.mockRejectedValue(new Error("auth not found"));

    await expect(
      authFilesApi.clearModelCooldown({ authIndex: "gone", model: "gpt-5.5" }),
    ).rejects.toThrow("auth not found");
  });
});
