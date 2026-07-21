import { beforeEach, describe, expect, test, vi } from "vitest";
import { endUsersApi } from "@code-proxy/api-client/endpoints/end-users";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../client/client", () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}));

describe("endUsersApi key mutations", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.delete.mockReset();
  });

  test("renames and rotates keys through owner-scoped endpoints", async () => {
    mocks.patch.mockResolvedValue({ id: "key-1", name: "Renamed" });
    mocks.post.mockResolvedValue({
      api_key: { id: "key-1", name: "Renamed" },
      plaintext_key: "sk-rotated",
    });

    await endUsersApi.updateKeyName("user-1", "key-1", "Renamed");
    await endUsersApi.rotateKey("user-1", "key-1");

    expect(mocks.patch).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1", {
      name: "Renamed",
    });
    expect(mocks.post).toHaveBeenCalledWith("/end-users/user-1/api-keys/key-1/rotate", {});
  });
});
